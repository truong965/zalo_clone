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
import type { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';
import { WsThrottleGuard } from 'src/socket/guards/ws-throttle.guard';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { SocketStateService } from 'src/socket/services/socket-state.service';
import { WsTransformInterceptor } from 'src/common/interceptor/ws-transform.interceptor';
import { WsExceptionFilter } from 'src/socket/filters/ws-exception.filter';
import { ReceiptStatus } from '@prisma/client';

import { MessageService } from './services/message.service';
import { ReceiptService } from './services/receipt.service';
import { MessageQueueService } from './services/message-queue.service';
import { MessageBroadcasterService } from './services/message-broadcaster.service';
import { MessageRealtimeService } from './services/message-realtime.service';

import { SendMessageDto } from './dto/send-message.dto';
import { MarkAsReadDto } from './dto/mark-as-read.dto';
import { TypingIndicatorDto } from './dto/typing-indicator.dto';

@WebSocketGateway({
  namespace: '/socket.io',
  cors: { origin: '*', credentials: true },
})
@UseGuards(WsThrottleGuard)
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

  constructor(
    private readonly messageService: MessageService,
    private readonly receiptService: ReceiptService,
    private readonly messageQueue: MessageQueueService,
    private readonly broadcaster: MessageBroadcasterService,
    private readonly realtime: MessageRealtimeService,
    private readonly socketState: SocketStateService,
  ) {}

  afterInit() {
    this.logger.log('📨 Message Gateway initialized');
  }

  async handleUserConnected(client: AuthenticatedSocket) {
    const userId = client.userId;
    this.logger.log(`📱 User ${userId} connected to messaging`);

    try {
      await this.realtime.syncOfflineMessages(client);

      if (!userId) return;
      const unsubReceipts = await this.realtime.subscribeToReceipts(
        userId,
        async (payload) =>
          this.emitToUser(userId, SocketEvents.MESSAGE_RECEIPT_UPDATE, payload),
      );

      this.addSubscription(client.id, unsubReceipts);
    } catch (error) {
      this.logger.error(
        `Error handling user connection for ${userId}`,
        (error as Error).stack,
      );
    }
  }

  async handleUserDisconnected(client: AuthenticatedSocket) {
    await this.cleanupSubscriptions(client.id);
    this.logger.log(`📴 User ${client.userId} disconnected from messaging`);
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

      throw error;
    }
  }

  @SubscribeMessage(SocketEvents.MESSAGE_DELIVERED_ACK)
  async handleMessageDelivered(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: bigint },
  ) {
    return this.handleMessageDeliveredInternal(client, data);
  }

  @SubscribeMessage(SocketEvents.MESSAGE_DELIVERED_CLIENT_ACK)
  async handleMessageDeliveredClientAck(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { messageId: bigint },
  ) {
    return this.handleMessageDeliveredInternal(client, data);
  }

  private async handleMessageDeliveredInternal(
    client: AuthenticatedSocket,
    data: { messageId: bigint },
  ) {
    const userId = client.userId;

    try {
      if (!userId) {
        throw new Error('Unauthenticated');
      }
      await this.receiptService.markAsDelivered(data.messageId, userId);

      const message = await this.messageService.findByClientMessageId(
        data.messageId.toString(),
      );

      if (message && message.senderId) {
        await this.broadcaster.broadcastReceiptUpdate(message.senderId, {
          messageId: data.messageId,
          userId,
          status: ReceiptStatus.DELIVERED,
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

      await this.realtime.markAsSeen(dto, userId);

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
      throw error;
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

      await this.realtime.typingStart(dto, userId);

      setTimeout(() => {
        this.realtime.typingStop(dto, userId).catch((error) => {
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
      await this.realtime.typingStop(dto, userId);
    } catch (error) {
      this.logger.error('Error handling typing stop', error);
    }
  }

  async subscribeToConversation(
    client: AuthenticatedSocket,
    conversationId: string,
  ) {
    const userId = client.userId;

    if (!userId) {
      throw new Error('Unauthenticated');
    }

    const { unsubMessages, unsubTyping } =
      await this.realtime.subscribeToConversation(
        conversationId,
        userId,
        (payload) => {
          if (payload.recipientIds.includes(userId)) {
            client.emit(SocketEvents.MESSAGE_NEW, {
              message: payload.message,
              conversationId,
            });
          }
        },
        (payload) => {
          if (payload.userId !== userId) {
            client.emit(SocketEvents.TYPING_STATUS, payload);
          }
        },
      );

    this.addSubscription(client.id, unsubMessages);
    this.addSubscription(client.id, unsubTyping);

    this.logger.debug(
      `User ${userId} subscribed to conversation ${conversationId}`,
    );
  }

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
