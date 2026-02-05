// src/modules/messaging/services/message-broadcaster.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisPubSubService } from 'src/modules/redis/services/redis-pub-sub.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import { Message } from '@prisma/client';

export interface NewMessagePayload {
  message: Message;
  recipientIds: string[];
  senderId: string;
}

export interface ReceiptUpdatePayload {
  messageId: bigint;
  userId: string;
  status: 'DELIVERED' | 'SEEN';
  timestamp: Date;
}

export interface TypingStatusPayload {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

@Injectable()
export class MessageBroadcasterService implements OnModuleInit {
  private readonly logger = new Logger(MessageBroadcasterService.name);

  constructor(private readonly redisPubSub: RedisPubSubService) {}

  onModuleInit() {
    this.logger.log('Message Broadcaster Service initialized');
  }

  /**
   * Broadcast new message to all gateway instances
   * Each gateway will emit to its connected clients
   */
  async broadcastNewMessage(
    conversationId: string,
    payload: NewMessagePayload,
  ): Promise<void> {
    try {
      const channel = RedisKeyBuilder.channels.newMessage(conversationId);

      await this.redisPubSub.publish(channel, payload);

      this.logger.debug(
        `Broadcasted message ${payload.message.id} to conversation ${conversationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast message ${payload.message.id}`,
        (error as Error).stack,
      );
      throw error; // Critical error - should propagate
    }
  }

  /**
   * Broadcast receipt update to sender
   */
  async broadcastReceiptUpdate(
    senderId: string,
    payload: ReceiptUpdatePayload,
  ): Promise<void> {
    try {
      const channel = RedisKeyBuilder.channels.receipt(senderId);

      await this.redisPubSub.publish(channel, payload);

      this.logger.debug(
        `Broadcasted ${payload.status} receipt for message ${payload.messageId} to sender ${senderId}`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to broadcast receipt update',
        (error as Error).stack,
      );
      // Non-critical - don't throw
    }
  }

  /**
   * Broadcast typing indicator
   */
  async broadcastTypingStatus(
    conversationId: string,
    payload: TypingStatusPayload,
  ): Promise<void> {
    try {
      const channel = RedisKeyBuilder.channels.typing(conversationId);

      await this.redisPubSub.publish(channel, payload);

      this.logger.debug(
        `Broadcasted typing status from ${payload.userId} in ${conversationId}`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to broadcast typing status',
        (error as Error).stack,
      );
      // Non-critical
    }
  }

  /**
   * Subscribe to new messages in a conversation
   * Returns unsubscribe function
   */
  async subscribeToConversation(
    conversationId: string,
    handler: (payload: NewMessagePayload) => void,
  ): Promise<() => Promise<void>> {
    const channel = RedisKeyBuilder.channels.newMessage(conversationId);

    await this.redisPubSub.subscribe(channel, (ch, message) => {
      try {
        const payload = JSON.parse(message) as NewMessagePayload;
        handler(payload);
      } catch (error) {
        this.logger.error('Error parsing new message payload', error);
      }
    });

    this.logger.debug(`Subscribed to conversation ${conversationId}`);

    // Return unsubscribe function
    return async () => {
      await this.redisPubSub.unsubscribe(channel);
      this.logger.debug(`Unsubscribed from conversation ${conversationId}`);
    };
  }

  /**
   * Subscribe to receipt updates for a user
   */
  async subscribeToReceipts(
    userId: string,
    handler: (payload: ReceiptUpdatePayload) => void | Promise<void>,
  ): Promise<() => Promise<void>> {
    const channel = RedisKeyBuilder.channels.receipt(userId);

    await this.redisPubSub.subscribe(channel, (ch, message) => {
      try {
        const payload = JSON.parse(message) as ReceiptUpdatePayload;
        // Gọi handler
        const result = handler(payload);

        // Kiểm tra xem kết quả có phải là Promise không để bắt lỗi (tránh Unhandled Rejection)
        if (result instanceof Promise) {
          result.catch((err) => {
            this.logger.error(`Async handler error for user ${userId}`, err);
          });
        }
      } catch (error) {
        this.logger.error('Error parsing receipt payload', error);
      }
    });

    return async () => {
      await this.redisPubSub.unsubscribe(channel);
    };
  }

  /**
   * Subscribe to typing indicators
   */
  async subscribeToTyping(
    conversationId: string,
    handler: (payload: TypingStatusPayload) => void,
  ): Promise<() => Promise<void>> {
    const channel = RedisKeyBuilder.channels.typing(conversationId);

    await this.redisPubSub.subscribe(channel, (ch, message) => {
      try {
        const payload = JSON.parse(message) as TypingStatusPayload;
        handler(payload);
      } catch (error) {
        this.logger.error('Error parsing typing payload', error);
      }
    });

    return async () => {
      await this.redisPubSub.unsubscribe(channel);
    };
  }
}
