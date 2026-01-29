// src/modules/messaging/services/message-queue.service.ts

import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisKeys } from 'src/common/constants/redis-keys.constant';
import { Message } from '@prisma/client';
import { RedisService } from 'src/modules/redis/redis.service';
import redisConfig from 'src/config/redis.config';
import type { ConfigType } from '@nestjs/config';
import { safeStringify } from 'src/common/utils/json.util';

interface QueuedMessage {
  messageId: bigint;
  conversationId: string;
  data: any;
  timestamp: number;
}

@Injectable()
export class MessageQueueService {
  private readonly logger = new Logger(MessageQueueService.name);

  // Max offline messages per user (prevent memory abuse)
  private readonly MAX_QUEUE_SIZE = 1000;

  // TTL for offline queue: 7 days

  constructor(
    private readonly redis: RedisService,
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
  ) {}

  /**
   * Enqueue message for offline user
   * Uses Redis Sorted Set (score = timestamp)
   */
  async enqueueMessage(userId: string, message: Message): Promise<void> {
    try {
      const queueKey = RedisKeys.cache.offlineMessages(userId);
      const score = new Date(message.createdAt).getTime();

      const queuedMsg: QueuedMessage = {
        messageId: message.id,
        conversationId: message.conversationId,
        data: message,
        timestamp: score,
      };

      const client = this.redis.getClient();
      // Add to sorted set
      await client.zadd(queueKey, score, safeStringify(queuedMsg));

      // Trim to max size (keep newest messages)
      const currentSize = await client.zcard(queueKey);
      if (currentSize > this.MAX_QUEUE_SIZE) {
        const removeCount = currentSize - this.MAX_QUEUE_SIZE;
        await client.zremrangebyrank(queueKey, 0, removeCount - 1);

        this.logger.warn(
          `Trimmed ${removeCount} old messages from queue for user ${userId}`,
        );
      }

      // Set TTL on queue
      await client.expire(queueKey, this.config.ttl.offlineQueue);

      this.logger.debug(
        `Enqueued message ${message.id} for offline user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue message for user ${userId}`,
        (error as Error).stack,
      );
      // Don't throw - offline queueing is best-effort
    }
  }

  /**
   * Get all offline messages for user (on reconnect)
   * Returns messages sorted by timestamp (oldest first)
   */
  async getOfflineMessages(userId: string): Promise<QueuedMessage[]> {
    try {
      const queueKey = RedisKeys.cache.offlineMessages(userId);

      const client = this.redis.getClient();
      // Get all messages (ordered by score)
      const rawMessages = await client.zrange(queueKey, 0, -1);

      if (!rawMessages || rawMessages.length === 0) {
        return [];
      }

      const messages = rawMessages.map(
        (msg) => JSON.parse(msg) as QueuedMessage,
      );

      this.logger.log(
        `Retrieved ${messages.length} offline messages for user ${userId}`,
      );

      return messages;
    } catch (error) {
      this.logger.error(
        `Failed to get offline messages for user ${userId}`,
        (error as Error).stack,
      );
      return [];
    }
  }

  /**
   * Clear offline queue after delivery
   */
  async clearQueue(userId: string): Promise<void> {
    try {
      const queueKey = RedisKeys.cache.offlineMessages(userId);
      const client = this.redis.getClient();
      await client.del(queueKey);

      this.logger.debug(`Cleared offline queue for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to clear queue for user ${userId}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Get queue size for monitoring
   */
  async getQueueSize(userId: string): Promise<number> {
    try {
      const queueKey = RedisKeys.cache.offlineMessages(userId);
      const client = this.redis.getClient();
      return await client.zcard(queueKey);
    } catch (error) {
      this.logger.error(`Failed to get queue size for user ${userId}`, error);
      return 0;
    }
  }
}
