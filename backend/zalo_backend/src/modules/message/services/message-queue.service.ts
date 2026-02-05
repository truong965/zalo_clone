// src/modules/message/services/message-queue.service.ts

import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
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
  private readonly MAX_QUEUE_SIZE = 1000;

  constructor(
    private readonly redis: RedisService,
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
  ) {}

  async enqueueMessage(userId: string, message: Message): Promise<void> {
    try {
      const queueKey = RedisKeyBuilder.offlineMessages(userId);
      const score = new Date(message.createdAt).getTime();

      const queuedMsg: QueuedMessage = {
        messageId: message.id,
        conversationId: message.conversationId,
        data: message,
        timestamp: score,
      };

      const client = this.redis.getClient();
      await client.zadd(queueKey, score, safeStringify(queuedMsg));

      const currentSize = await client.zcard(queueKey);
      if (currentSize > this.MAX_QUEUE_SIZE) {
        const removeCount = currentSize - this.MAX_QUEUE_SIZE;
        await client.zremrangebyrank(queueKey, 0, removeCount - 1);

        this.logger.warn(
          `Trimmed ${removeCount} old messages from queue for user ${userId}`,
        );
      }

      await client.expire(queueKey, this.config.ttl.offlineQueue);

      this.logger.debug(
        `Enqueued message ${message.id} for offline user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue message for user ${userId}`,
        (error as Error).stack,
      );
    }
  }

  async getOfflineMessages(userId: string): Promise<QueuedMessage[]> {
    try {
      const queueKey = RedisKeyBuilder.offlineMessages(userId);

      const client = this.redis.getClient();
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

  async clearQueue(userId: string): Promise<void> {
    try {
      const queueKey = RedisKeyBuilder.offlineMessages(userId);
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

  async getQueueSize(userId: string): Promise<number> {
    try {
      const queueKey = RedisKeyBuilder.offlineMessages(userId);
      const client = this.redis.getClient();
      return await client.zcard(queueKey);
    } catch (error) {
      this.logger.error(`Failed to get queue size for user ${userId}`, error);
      return 0;
    }
  }
}
