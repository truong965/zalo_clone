// src/modules/messaging/messaging.gateway.ts

import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Logger, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import type { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';
import { WsThrottleGuard } from 'src/socket/guards/ws-throttle.guard';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { SocketStateService } from 'src/socket/services/socket-state.service';

// Services
import { MessageService } from './services/message.service';
import { ConversationService } from './services/conversation.service';
import { ReceiptService } from './services/receipt.service';
import { MessageQueueService } from './services/message-queue.service';
import { MessageBroadcasterService } from './services/message-broadcaster.service';

// DTOs
import { SendMessageDto } from './dto/send-message.dto';
import { MarkAsReadDto } from './dto/mark-as-read.dto';
import { TypingIndicatorDto } from './dto/typing-indicator.dto';

import { Message } from '@prisma/client';
import { safeJSON } from 'src/common/utils/json.util';

@WebSocketGateway({
  namespace: '/socket.io',
  cors: { origin: '*', credentials: true },
})
@UseGuards(WsThrottleGuard)
@UsePipes(new ValidationPipe({ transform: true }))
export class MessagingGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagingGateway.name);

  // Track active subscriptions per socket (for cleanup)
  private socketSubscriptions = new Map<
    string,
    (() => void | Promise<void>)[]
  >();

  constructor(
    private readonly messageService: MessageService,
    private readonly conversationService: ConversationService,
    private readonly receiptService: ReceiptService,
    private readonly messageQueue: MessageQueueService,
    private readonly broadcaster: MessageBroadcasterService,
    private readonly socketState: SocketStateService,
  ) {}

  afterInit() {
    this.logger.log('📨 Messaging Gateway initialized');
    this.setupCrossServerSubscriptions();
  }

  /**
   * Setup Redis Pub/Sub listeners for cross-server events
   * These handlers run on ALL gateway instances
   */
  private setupCrossServerSubscriptions() {
    // This will be called once per gateway instance
    // We'll subscribe to generic channels here
    // Conversation-specific subscriptions happen per-socket in handleConnection

    this.logger.log('✅ Cross-server subscriptions ready');
  }

  /**
   * Called when user connects (from socket.gateway.ts)
   * We subscribe this user to their conversation channels
   */
  async handleUserConnected(client: AuthenticatedSocket) {
    const userId = client.userId;

    this.logger.log(`📱 User ${userId} connected to messaging`);

    try {
      // ========================================
      // STEP 1: Sync Offline Messages
      // ========================================
      await this.syncOfflineMessages(client);

      // ========================================
      // STEP 2: Subscribe to Receipt Updates
      // ========================================
      if (!userId) return;
      const unsubReceipts = await this.broadcaster.subscribeToReceipts(
        userId,
        async (payload) => {
          // Emit receipt update to this user's all sockets
          await this.emitToUser(
            userId,
            SocketEvents.MESSAGE_RECEIPT_UPDATE,
            payload,
          );
        },
      );

      // Store unsubscribe function for cleanup
      this.addSubscription(client.id, unsubReceipts);

      // ========================================
      // STEP 3: Subscribe to User's Conversations
      // ========================================
      // Note: We subscribe to conversations dynamically when user
      // joins/opens a chat (not all at once to save memory)
      // This happens in subscribeToConversation() method below
    } catch (error) {
      this.logger.error(
        `Error handling user connection for ${userId}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Sync offline messages on reconnect
   */
  private async syncOfflineMessages(client: AuthenticatedSocket) {
    const userId = client.userId;
    if (!userId) return;
    try {
      const offlineMessages =
        await this.messageQueue.getOfflineMessages(userId);

      if (offlineMessages.length === 0) {
        this.logger.debug(`No offline messages for user ${userId}`);
        return;
      }

      this.logger.log(
        `Syncing ${offlineMessages.length} offline messages to user ${userId}`,
      );

      // [FIX 1] Ép kiểu 'as Message' và Serialize BigInt
      // Map data từ queue sang Message object, sau đó serialize để tránh lỗi BigInt
      const sanitizedMessages = offlineMessages.map((qm) => {
        const rawMsg = qm.data as Message; //  FIX LỖI ANY Ở ĐÂY
        return safeJSON(rawMsg);
      });
      // Send batch to client
      // Sử dụng emitWithAck như đã bàn trước đó để đảm bảo an toàn dữ liệu
      client.emit(SocketEvents.MESSAGES_SYNC, {
        messages: sanitizedMessages,
        count: offlineMessages.length,
      });

      // Mark all as delivered
      const messageIds = offlineMessages.map((qm) => qm.messageId);
      await this.receiptService.bulkMarkAsDelivered(messageIds, userId);

      // Notify senders about delivery
      for (const qm of offlineMessages) {
        const message = qm.data as Message;
        if (message.senderId && message.senderId !== userId) {
          await this.broadcaster.broadcastReceiptUpdate(message.senderId, {
            messageId: message.id,
            userId,
            status: 'DELIVERED',
            timestamp: new Date(),
          });
        }
      }

      // Clear queue
      await this.messageQueue.clearQueue(userId);

      this.logger.log(`✅ Offline sync completed for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to sync offline messages for user ${userId}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Called when user disconnects
   */
  async handleUserDisconnected(client: AuthenticatedSocket) {
    // Cleanup all subscriptions
    await this.cleanupSubscriptions(client.id);

    this.logger.log(`📴 User ${client.userId} disconnected from messaging`);
  }

  // ============================================================
  // WEBSOCKET MESSAGE HANDLERS
  // ============================================================

  /**
   * Handle: Send Message
   */
  @SubscribeMessage(SocketEvents.MESSAGE_SEND)
  @UseGuards(WsThrottleGuard) // Rate limit: 30 msg/min
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const senderId = client.userId;

    try {
      this.logger.debug(
        `Sending message from ${senderId} to conversation ${dto.conversationId}`,
      );

      // ========================================
      // STEP 1: Persist Message
      // ========================================
      if (!senderId) {
        throw new Error('Unauthenticated');
      }
      const message = await this.messageService.sendMessage(dto, senderId);

      // ========================================
      // STEP 2: ACK to Sender (Immediate)
      // ========================================
      client.emit(SocketEvents.MESSAGE_SENT_ACK, {
        clientMessageId: dto.clientMessageId,
        serverMessageId: message.id.toString(),
        timestamp: message.createdAt,
      });

      // ========================================
      // STEP 3: Get Recipients
      // ========================================
      const members = await this.conversationService.getActiveMembers(
        dto.conversationId,
      );

      const recipients = members.filter((m) => m.userId !== senderId);
      const recipientIds = recipients.map((r) => r.userId);

      // ========================================
      // STEP 4: Broadcast to Other Gateway Instances
      // ========================================
      const safeMsg = safeJSON(message);
      await this.broadcaster.broadcastNewMessage(dto.conversationId, {
        message: safeMsg,
        recipientIds,
        senderId,
      });

      // ========================================
      // STEP 5: Deliver to Online Recipients (Local)
      // ========================================
      await this.deliverMessageToRecipients(safeMsg, recipientIds, senderId);

      this.logger.log(
        `✅ Message ${message.id} sent and broadcasted to ${recipientIds.length} recipients`,
      );

      return { success: true, messageId: message.id };
    } catch (error) {
      this.logger.error('Error sending message', (error as Error).stack);

      // Send error to client
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.MESSAGE_SEND,
        clientMessageId: dto.clientMessageId,
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Deliver message to recipients (online check + queue)
   */
  private async deliverMessageToRecipients(
    message: Message,
    recipientIds: string[],
    senderId: string,
  ) {
    for (const recipientId of recipientIds) {
      const isOnline = await this.socketState.isUserOnline(recipientId);

      if (isOnline) {
        // Deliver immediately via WebSocket
        await this.emitToUser(recipientId, SocketEvents.MESSAGE_NEW, {
          message,
          conversationId: message.conversationId,
        });

        // Auto-mark as delivered
        await this.receiptService.markAsDelivered(message.id, recipientId);

        // Notify sender about delivery
        await this.broadcaster.broadcastReceiptUpdate(senderId, {
          messageId: message.id,
          userId: recipientId,
          status: 'DELIVERED',
          timestamp: new Date(),
        });

        // Increment unread count
        await this.conversationService.incrementUnreadCount(
          message.conversationId,
          recipientId,
        );
      } else {
        // Queue for offline delivery
        await this.messageQueue.enqueueMessage(recipientId, message);

        this.logger.debug(
          `Queued message ${message.id} for offline user ${recipientId}`,
        );
      }
    }
  }

  /**
   * Handle: Message Delivered (Client ACK)
   * Client confirms it received the message
   */
  @SubscribeMessage(SocketEvents.MESSAGE_DELIVERED_ACK)
  async handleMessageDelivered(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: bigint },
  ) {
    const userId = client.userId;

    try {
      if (!userId) {
        throw new Error('Unauthenticated');
      }
      await this.receiptService.markAsDelivered(data.messageId, userId);

      // Get message to find sender
      const message = await this.messageService.findByClientMessageId(
        data.messageId.toString(),
      );

      if (message && message.senderId) {
        // Notify sender
        await this.broadcaster.broadcastReceiptUpdate(message.senderId, {
          messageId: data.messageId,
          userId,
          status: 'DELIVERED',
          timestamp: new Date(),
        });
      }
    } catch (error) {
      this.logger.error('Error marking message as delivered', error);
    }
  }

  /**
   * Handle: Mark Messages as Seen/Read
   */
  @SubscribeMessage(SocketEvents.MESSAGE_SEEN)
  async handleMarkAsSeen(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: MarkAsReadDto,
  ) {
    const userId = client.userId;

    try {
      if (!userId) {
        throw new Error('Unauthenticated');
      }
      // Permission check
      const isMember = await this.conversationService.isMember(
        dto.conversationId,
        userId,
      );

      if (!isMember) {
        throw new Error('Not a member of this conversation');
      }

      // Mark as seen
      await this.receiptService.markAsSeen(dto.messageIds, userId);

      // Reset unread count
      await this.conversationService.resetUnreadCount(
        dto.conversationId,
        userId,
      );

      // Get message senders and notify them
      // (In production, batch this query)
      for (const messageId of dto.messageIds) {
        const message = await this.messageService.findByClientMessageId(
          messageId.toString(),
        );

        if (message && message.senderId && message.senderId !== userId) {
          await this.broadcaster.broadcastReceiptUpdate(message.senderId, {
            messageId,
            userId,
            status: 'SEEN',
            timestamp: new Date(),
          });
        }
      }

      this.logger.debug(
        `User ${userId} marked ${dto.messageIds.length} messages as seen`,
      );

      return { success: true };
    } catch (error) {
      this.logger.error(
        'Error marking messages as seen',
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * Handle: Typing Indicator (Start)
   */
  @SubscribeMessage(SocketEvents.TYPING_START)
  async handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: TypingIndicatorDto,
  ) {
    const userId = client.userId;

    try {
      if (!userId) {
        throw new Error('Unauthenticated');
      }
      // Permission check
      const isMember = await this.conversationService.isMember(
        dto.conversationId,
        userId,
      );

      if (!isMember) return;

      // Broadcast typing status
      await this.broadcaster.broadcastTypingStatus(dto.conversationId, {
        conversationId: dto.conversationId,
        userId,
        isTyping: true,
      });

      // Auto-stop after 3 seconds (in case client doesn't send stop)
      setTimeout(() => {
        // 2. Gọi hàm async và xử lý lỗi ngay lập tức
        this.broadcaster
          .broadcastTypingStatus(dto.conversationId, {
            conversationId: dto.conversationId,
            userId,
            isTyping: false,
          })
          .catch((error) => {
            // 3. BẮT BUỘC: Log lỗi vì ngữ cảnh này chạy tách biệt với luồng chính
            this.logger.error(
              `Error broadcasting typing timeout for user ${userId}`,
              error,
            );
          });
      }, 3000);
    } catch (error) {
      this.logger.error('Error handling typing start', error);
    }
  }

  /**
   * Handle: Typing Indicator (Stop)
   */
  @SubscribeMessage(SocketEvents.TYPING_STOP)
  async handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: TypingIndicatorDto,
  ) {
    const userId = client.userId;

    try {
      if (!userId) {
        throw new Error('Unauthenticated');
      }
      await this.broadcaster.broadcastTypingStatus(dto.conversationId, {
        conversationId: dto.conversationId,
        userId,
        isTyping: false,
      });
    } catch (error) {
      this.logger.error('Error handling typing stop', error);
    }
  }

  // ============================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================

  /**
   * Subscribe socket to a conversation's message channel
   * Called when user opens a chat
   */
  async subscribeToConversation(
    client: AuthenticatedSocket,
    conversationId: string,
  ) {
    const userId = client.userId;

    if (!userId) {
      throw new Error('Unauthenticated');
    }
    // Permission check
    const isMember = await this.conversationService.isMember(
      conversationId,
      userId,
    );

    if (!isMember) {
      this.logger.warn(
        `User ${userId} attempted to subscribe to unauthorized conversation ${conversationId}`,
      );
      return;
    }

    // Subscribe to new messages
    const unsubMessages = await this.broadcaster.subscribeToConversation(
      conversationId,
      (payload) => {
        // Only emit to recipients (not sender)
        if (payload.recipientIds.includes(userId)) {
          client.emit(SocketEvents.MESSAGE_NEW, {
            message: payload.message,
            conversationId,
          });
        }
      },
    );

    // Subscribe to typing indicators
    const unsubTyping = await this.broadcaster.subscribeToTyping(
      conversationId,
      (payload) => {
        // Don't echo back to sender
        if (payload.userId !== userId) {
          client.emit(SocketEvents.TYPING_STATUS, payload);
        }
      },
    );

    // Store unsubscribe functions
    this.addSubscription(client.id, unsubMessages);
    this.addSubscription(client.id, unsubTyping);

    this.logger.debug(
      `User ${userId} subscribed to conversation ${conversationId}`,
    );
  }

  /**
   * Unsubscribe from conversation
   */
  unsubscribeFromConversation(
    client: AuthenticatedSocket,
    conversationId: string,
  ) {
    // In practice, we just cleanup all subscriptions on disconnect
    // But you could implement selective unsubscribe here
    this.logger.debug(
      `User ${client.userId} unsubscribed from conversation ${conversationId}`,
    );
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Emit event to all sockets of a user
   */
  private async emitToUser(userId: string, event: string, data: any) {
    const socketIds = await this.socketState.getUserSockets(userId);

    for (const socketId of socketIds) {
      this.server.to(socketId).emit(event, data);
    }
  }

  /**
   * Track subscription for cleanup
   */
  private addSubscription(
    socketId: string,
    teardown: () => void | Promise<void>,
  ) {
    if (!this.socketSubscriptions.has(socketId)) {
      this.socketSubscriptions.set(socketId, []);
    }

    this.socketSubscriptions.get(socketId)!.push(teardown);
  }

  /**
   * Cleanup all subscriptions for a socket
   */
  private async cleanupSubscriptions(socketId: string): Promise<void> {
    const subscriptions = this.socketSubscriptions.get(socketId);

    if (!subscriptions || subscriptions.length === 0) return;

    // 2. Sử dụng Promise.allSettled thay vì forEach
    // Để chạy song song tất cả các tác vụ hủy, tiết kiệm thời gian chờ
    await Promise.allSettled(
      subscriptions.map(async (unsub) => {
        try {
          // Xử lý linh hoạt cả hàm đồng bộ và bất đồng bộ
          await unsub();
        } catch (error) {
          // Log lỗi cụ thể cho từng subscription để dễ debug
          this.logger.error(
            `Error unsubscribing for socket ${socketId}`,
            error,
          );
        }
      }),
    );

    // 3. Xóa sạch dữ liệu sau khi đã đảm bảo cleanup xong
    this.socketSubscriptions.delete(socketId);

    this.logger.debug(
      `Cleaned up ${subscriptions.length} subscriptions for socket ${socketId}`,
    );
  }
}
