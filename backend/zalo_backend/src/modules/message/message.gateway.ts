import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import {
  Logger,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';
import { WsThrottleGuard } from 'src/common/guards/ws-throttle.guard';
import { WsJwtGuard } from 'src/common/guards/ws-jwt.guard';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { SocketStateService } from 'src/socket/services/socket-state.service';
import { WsTransformInterceptor } from 'src/common/interceptor/ws-transform.interceptor';
import { WsExceptionFilter } from 'src/common/filters/ws-exception.filter';
import { ConversationType } from '@prisma/client';

import { MessageService } from './services/message.service';
import { ReceiptService } from './services/receipt.service';
import { MessageQueueService } from './services/message-queue.service';
import { MessageBroadcasterService } from './services/message-broadcaster.service';
import { MessageRealtimeService } from './services/message-realtime.service';
import { PrismaService } from 'src/database/prisma.service';

import { SendMessageDto } from './dto/send-message.dto';
import { InternalEventNames } from '@common/contracts/events';
import { MarkAsReadDto } from './dto/mark-as-read.dto';
import { TypingIndicatorDto } from './dto/typing-indicator.dto';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/socket.io',
})
@UseGuards(WsJwtGuard, WsThrottleGuard)
@UsePipes(new ValidationPipe({ transform: true }))
@UseInterceptors(WsTransformInterceptor)
@UseFilters(WsExceptionFilter)
export class MessageGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessageGateway.name);
  private socketSubscriptions = new Map<
    string,
    (() => void | Promise<void>)[]
  >();

  // MSG-R3: Only 1 receipt subscription per user, tracked by refCount
  private userReceiptSubscriptions = new Map<
    string,
    { teardown: () => void | Promise<void>; refCount: number }
  >();

  // MSG-R7: Debounced typing timeouts per user-conversation
  private typingTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly messageService: MessageService,
    private readonly receiptService: ReceiptService,
    private readonly messageQueue: MessageQueueService,
    private readonly broadcaster: MessageBroadcasterService,
    private readonly realtime: MessageRealtimeService,
    private readonly socketState: SocketStateService,
    private readonly prisma: PrismaService,
  ) { }

  afterInit() {
    this.logger.log('📨 Message Gateway initialized');
  }

  /**
   * Listen to USER_SOCKET_CONNECTED event from SocketGateway
   * This is emitted AFTER authentication, so userId is guaranteed to be set
   */
  @OnEvent(InternalEventNames.USER_SOCKET_CONNECTED)
  async handleUserConnected(payload: {
    userId: string;
    socketId?: string | null;
    socket?: AuthenticatedSocket;
  }) {
    const { userId, socket } = payload;

    // Ignore cross-server presence rebroadcasts that do not carry a local socket.
    if (!socket) {
      this.logger.debug(
        `Skipping message subscription setup for ${userId} because no local socket was provided`,
      );
      return;
    }

    this.logger.log(
      `📱 User ${userId} authenticated - setting up message subscriptions`,
    );

    try {
      await this.realtime.syncOfflineMessages(socket);

      if (!userId) {
        this.logger.warn(
          `Cannot subscribe receipts: userId is undefined for socket ${socket.id}`,
        );
        return;
      }

      // MSG-R3: Only subscribe once per user (refCount pattern)
      const existing = this.userReceiptSubscriptions.get(userId);
      if (existing) {
        existing.refCount++;
        this.logger.debug(
          `Receipt subscription refCount++ for user ${userId} (now ${existing.refCount})`,
        );
      } else {
        const unsubReceipts = await this.realtime.subscribeToReceipts(
          userId,
          async (payload) =>
            this.emitToUser(
              userId,
              SocketEvents.MESSAGE_RECEIPT_UPDATE,
              payload,
            ),
        );

        this.userReceiptSubscriptions.set(userId, {
          teardown: unsubReceipts,
          refCount: 1,
        });
        this.logger.debug(
          `✅ User ${userId} subscribed to receipt channel (refCount=1)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error subscribing user ${userId} to message channels`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Listen to USER_SOCKET_DISCONNECTED event from SocketGateway
   */
  @OnEvent(InternalEventNames.USER_SOCKET_DISCONNECTED)
  async handleUserDisconnected(payload: { userId: string; socketId: string }) {
    // MSG-R3: Decrement refCount, only unsubscribe when last socket disconnects
    const existing = this.userReceiptSubscriptions.get(payload.userId);
    if (existing) {
      existing.refCount--;
      if (existing.refCount <= 0) {
        try {
          await existing.teardown();
        } catch (error) {
          const msg = (error as Error).message;
          if (
            !msg?.includes('Connection is closed') &&
            !msg?.includes('ECONNABORTED')
          ) {
            this.logger.error(
              `Error unsubscribing receipts for user ${payload.userId}`,
              error,
            );
          }
        }
        this.userReceiptSubscriptions.delete(payload.userId);
        this.logger.debug(
          `Receipt subscription removed for user ${payload.userId}`,
        );
      } else {
        this.logger.debug(
          `Receipt subscription refCount-- for user ${payload.userId} (now ${existing.refCount})`,
        );
      }
    }

    await this.cleanupSubscriptions(payload.socketId);
    this.logger.log(
      `📴 User ${payload.userId} disconnected - cleaned up message subscriptions`,
    );
  }

  @SubscribeMessage(SocketEvents.MESSAGE_SEND)
  @UseGuards(WsThrottleGuard)
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const senderId = client.userId;

    try {
      this.logger.debug(
        `Sending message from ${senderId} to conversation ${dto.conversationId}`,
      );

      if (!senderId) {
        throw new Error('Unauthenticated');
      }
      const message = await this.realtime.sendMessageAndBroadcast(
        dto,
        senderId,
        (userId, event, data) => this.emitToUser(userId, event, data),
        (userId) => this.socketState.isUserOnline(userId),
      );

      client.emit(SocketEvents.MESSAGE_SENT_ACK, {
        clientMessageId: dto.clientMessageId,
        serverMessageId: message.id.toString(),
        timestamp: message.createdAt,
      });

      return { messageId: message.id.toString() };
    } catch (error) {
      this.logger.error('Error sending message', (error as Error).stack);

      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.MESSAGE_SEND,
        clientMessageId: dto.clientMessageId,
        error: (error as Error).message,
      });

      return { success: false, data: null, error: (error as Error).message };
    }
  }

  @SubscribeMessage(SocketEvents.MESSAGE_DELIVERED_ACK)
  async handleMessageDelivered(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: string },
  ) {
    return this.handleMessageDeliveredInternal(client, data);
  }

  @SubscribeMessage(SocketEvents.MESSAGE_DELIVERED_CLIENT_ACK)
  async handleMessageDeliveredClientAck(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: string },
  ) {
    return this.handleMessageDeliveredInternal(client, data);
  }

  private async handleMessageDeliveredInternal(
    client: AuthenticatedSocket,
    data: { messageId: string },
  ) {
    const userId = client.userId;

    try {
      if (!userId) {
        throw new Error('Unauthenticated');
      }
      const messageId = BigInt(data.messageId);

      // Look up the message to get conversationId and determine type
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: {
          senderId: true,
          conversationId: true,
          conversation: { select: { type: true } },
        },
      });

      if (!message) return;

      // Only mark direct delivered in JSONB for DIRECT conversations
      if (message.conversation.type === ConversationType.DIRECT) {
        await this.receiptService.markDirectDelivered(messageId, userId);
      }

      if (message.senderId) {
        await this.broadcaster.broadcastReceiptUpdate(message.senderId, {
          messageId,
          conversationId: message.conversationId,
          userId,
          type: 'delivered',
          timestamp: new Date(),
        });
      }
    } catch (error) {
      this.logger.error('Error marking message as delivered', error);
    }
  }

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

      await this.realtime.markAsSeen(dto, userId, (uid, event, data) =>
        this.emitToUser(uid, event, data),
      );

      return true;
    } catch (error) {
      this.logger.error(
        'Error marking messages as seen',
        (error as Error).stack,
      );
      client.emit(SocketEvents.ERROR, {
        event: SocketEvents.MESSAGE_SEEN,
        error: (error as Error).message,
      });
      return { success: false, data: null, error: (error as Error).message };
    }
  }

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

      await this.realtime.broadcastTypingToMembers(
        dto,
        userId,
        (uid, event, data) => this.emitToUser(uid, event, data),
      );

      // MSG-R7: Cancel any existing timeout for this user-conversation
      const timeoutKey = `${userId}:${dto.conversationId}`;
      const existingTimeout = this.typingTimeouts.get(timeoutKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Set new auto-stop timeout
      const timeout = setTimeout(() => {
        this.typingTimeouts.delete(timeoutKey);
        this.realtime
          .broadcastTypingToMembers(
            { ...dto, isTyping: false },
            userId,
            (uid, event, data) => this.emitToUser(uid, event, data),
          )
          .catch((error) => {
            this.logger.error(
              `Error broadcasting typing timeout for user ${userId}`,
              error,
            );
          });
      }, 3000);
      this.typingTimeouts.set(timeoutKey, timeout);
    } catch (error) {
      this.logger.error('Error handling typing start', error);
    }
  }

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
      await this.realtime.broadcastTypingToMembers(
        dto,
        userId,
        (uid, event, data) => this.emitToUser(uid, event, data),
      );

      // MSG-R7: Cancel auto-stop timeout when user explicitly stops typing
      const timeoutKey = `${userId}:${dto.conversationId}`;
      const existingTimeout = this.typingTimeouts.get(timeoutKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        this.typingTimeouts.delete(timeoutKey);
      }
    } catch (error) {
      this.logger.error('Error handling typing stop', error);
    }
  }

  // MSG-R2: subscribeToConversation removed — was dead code (no call site).
  // conversation:read now delivered via direct emit in handleGroupMessageSeen.

  private async emitToUser(userId: string, event: string, data: unknown) {
    const socketIds = await this.socketState.getUserSockets(userId);

    for (const socketId of socketIds) {
      this.server.to(socketId).emit(event, data);
    }
  }

  private addSubscription(
    socketId: string,
    teardown: () => void | Promise<void>,
  ) {
    if (!this.socketSubscriptions.has(socketId)) {
      this.socketSubscriptions.set(socketId, []);
    }

    this.socketSubscriptions.get(socketId)!.push(teardown);
  }

  private async cleanupSubscriptions(socketId: string): Promise<void> {
    const subscriptions = this.socketSubscriptions.get(socketId);

    if (!subscriptions || subscriptions.length === 0) return;

    await Promise.allSettled(
      subscriptions.map(async (unsub) => {
        try {
          await unsub();
        } catch (error) {
          const msg = (error as Error).message;
          if (
            msg &&
            (msg.includes('Connection is closed') ||
              msg.includes('ECONNABORTED'))
          ) {
            return;
          }
          this.logger.error(
            `Error unsubscribing for socket ${socketId}`,
            error,
          );
        }
      }),
    );

    this.socketSubscriptions.delete(socketId);

    this.logger.debug(
      `Cleaned up ${subscriptions.length} subscriptions for socket ${socketId}`,
    );
  }

  // Business logic moved to MessageRealtimeService (Phase 4: gateway slimming)
}
