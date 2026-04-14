import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisPubSubService } from 'src/shared/redis/services/redis-pub-sub.service';
import { AiRedisPublisherService } from 'src/shared/redis/services/ai-redis-publisher.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import { Message } from '@prisma/client';

export interface NewMessagePayload {
  message: Message;
  recipientIds: string[];
  senderId: string;
}

export interface ReceiptUpdatePayload {
  messageId: bigint;
  conversationId: string;
  userId: string;
  type: 'delivered' | 'seen';
  timestamp: Date;
}

export interface ConversationReadPayload {
  userId: string;
  conversationId: string;
  messageId: string | null;
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

  constructor(
    private readonly redisPubSub: RedisPubSubService,
    private readonly aiRedisPublisher: AiRedisPublisherService,
  ) {}

  onModuleInit() {
    this.logger.log('Message Broadcaster Service initialized');
  }

  async broadcastNewMessage(
    conversationId: string,
    payload: NewMessagePayload,
  ): Promise<void> {
    try {
      const channel = RedisKeyBuilder.channels.newMessage(conversationId);
      const globalChannel = RedisKeyBuilder.channels.globalNewMessage;

      await Promise.all([
        this.redisPubSub.publish(channel, payload),
      ]);

      this.logger.debug(
        `Broadcasted message ${payload.message.id} to conversation ${conversationId} and global channel`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast message ${payload.message.id}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  async broadcastReceiptUpdate(
    senderId: string,
    payload: ReceiptUpdatePayload,
  ): Promise<void> {
    try {
      const channel = RedisKeyBuilder.channels.receipt(senderId);

      await this.redisPubSub.publish(channel, payload);

      this.logger.debug(
        `Broadcasted ${payload.type} receipt for message ${payload.messageId} to sender ${senderId}`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to broadcast receipt update',
        (error as Error).stack,
      );
    }
  }

  /**
   * Broadcast a group conversation:read event to all members of the conversation.
   */
  async broadcastConversationRead(
    conversationId: string,
    payload: ConversationReadPayload,
  ): Promise<void> {
    try {
      const channel = RedisKeyBuilder.channels.newMessage(conversationId);
      await this.redisPubSub.publish(channel, {
        _type: 'conversation:read',
        ...payload,
      });

      this.logger.debug(
        `Broadcasted conversation:read for ${conversationId} by user ${payload.userId}`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to broadcast conversation read',
        (error as Error).stack,
      );
    }
  }

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
    }
  }

  async subscribeToConversation(
    conversationId: string,
    handler: (payload: NewMessagePayload) => void,
  ): Promise<() => Promise<void>> {
    const channel = RedisKeyBuilder.channels.newMessage(conversationId);

    const wrappedHandler = (ch: string, message: string) => {
      try {
        const payload = JSON.parse(message) as NewMessagePayload;
        handler(payload);
      } catch (error) {
        this.logger.error('Error parsing new message payload', error);
      }
    };

    await this.redisPubSub.subscribe(channel, wrappedHandler);

    this.logger.debug(`Subscribed to conversation ${conversationId}`);

    return async () => {
      await this.redisPubSub.unsubscribe(channel, wrappedHandler);
      this.logger.debug(`Unsubscribed from conversation ${conversationId}`);
    };
  }

  async subscribeToReceipts(
    userId: string,
    handler: (payload: ReceiptUpdatePayload) => void | Promise<void>,
  ): Promise<() => Promise<void>> {
    const channel = RedisKeyBuilder.channels.receipt(userId);

    const wrappedHandler = (ch: string, message: string) => {
      try {
        const payload = JSON.parse(message) as ReceiptUpdatePayload;
        const result = handler(payload);

        if (result instanceof Promise) {
          result.catch((err) => {
            this.logger.error(`Async handler error for user ${userId}`, err);
          });
        }
      } catch (error) {
        this.logger.error('Error parsing receipt payload', error);
      }
    };

    await this.redisPubSub.subscribe(channel, wrappedHandler);

    return async () => {
      await this.redisPubSub.unsubscribe(channel, wrappedHandler);
    };
  }

  async subscribeToTyping(
    conversationId: string,
    handler: (payload: TypingStatusPayload) => void,
  ): Promise<() => Promise<void>> {
    const channel = RedisKeyBuilder.channels.typing(conversationId);

    const wrappedHandler = (ch: string, message: string) => {
      try {
        const payload = JSON.parse(message) as TypingStatusPayload;
        handler(payload);
      } catch (error) {
        this.logger.error('Error parsing typing payload', error);
      }
    };

    await this.redisPubSub.subscribe(channel, wrappedHandler);

    return async () => {
      await this.redisPubSub.unsubscribe(channel, wrappedHandler);
    };
  }
}
