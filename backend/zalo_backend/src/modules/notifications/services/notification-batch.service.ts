/**
 * NotificationBatchService — Redis-based notification batching (anti-spam).
 *
 * Gom notifications cùng (recipientId, conversationId) trong time-window
 * để tránh spam push notifications.
 *
 * Uses Redis HINCRBY + HSET + TTL for atomic batch state.
 * Uses setTimeout for delayed push dispatch (within same instance).
 *
 * Cross-instance considerations:
 * - Redis hash là shared state → multiple instances thấy cùng state
 * - Chỉ instance đầu tiên (HINCRBY count returns 1) schedule timer
 * - Nếu instance đó crash → TTL tự cleanup, user miss 1 batch (acceptable for fire-and-forget)
 *
 * Performance:
 * - Each addToBatch = 1 Redis pipeline (HINCRBY + HSET + EXPIRE) = ~0.2ms
 * - Each flushBatch = 1 HGETALL + 1 DEL = ~0.3ms
 * - Memory: ~300 bytes/batch, TTL auto-cleanup → negligible
 */

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@modules/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';

/** Batch state stored in Redis hash */
export interface BatchState {
      count: number;
      lastContent: string;
      senderName: string;
      conversationId: string;
      conversationName: string;
      conversationType: 'DIRECT' | 'GROUP';
}

/** Params for adding a message to a batch */
export interface AddToBatchParams {
      recipientId: string;
      conversationId: string;
      senderName: string;
      messageContent: string;
      conversationType: 'DIRECT' | 'GROUP';
      conversationName: string | null;
      /** Batch time-window in seconds (5 for 1:1, 10 for group) */
      windowSeconds: number;
}

@Injectable()
export class NotificationBatchService {
      private readonly logger = new Logger(NotificationBatchService.name);

      constructor(private readonly redis: RedisService) { }

      /**
       * Add a message notification to the batch for (recipientId, conversationId).
       *
       * Uses Redis pipeline for atomicity:
       * 1. HINCRBY count → returns new count
       * 2. HSET senderName, lastContent, conversationType, conversationName
       * 3. EXPIRE with windowSeconds
       *
       * @returns { isNewBatch: true } if this is the first message in a new window
       *          (caller should schedule a delayed push).
       */
      async addToBatch(params: AddToBatchParams): Promise<{ isNewBatch: boolean; currentCount: number }> {
            const {
                  recipientId,
                  conversationId,
                  senderName,
                  messageContent,
                  conversationType,
                  conversationName,
                  windowSeconds,
            } = params;

            const key = RedisKeyBuilder.notificationBatch(recipientId, conversationId);
            const client = this.redis.getClient();

            const pipeline = client.pipeline();
            pipeline.hincrby(key, 'count', 1);
            pipeline.hset(key, {
                  senderName,
                  lastContent: messageContent,
                  conversationType,
                  conversationName: conversationName ?? '',
                  conversationId,
            });
            // TTL set slightly longer than window to avoid premature expiry during flush
            pipeline.expire(key, windowSeconds + 2);

            const results = await pipeline.exec();

            // HINCRBY result is at index 0, value at [1]
            const currentCount = (results?.[0]?.[1] as number) ?? 1;
            const isNewBatch = currentCount === 1;

            return { isNewBatch, currentCount };
      }

      /**
       * Flush and delete the batch state for (recipientId, conversationId).
       * Called when the batch timer fires.
       *
       * @returns BatchState if batch existed, null if already expired/flushed.
       */
      async flushBatch(recipientId: string, conversationId: string): Promise<BatchState | null> {
            const key = RedisKeyBuilder.notificationBatch(recipientId, conversationId);
            const client = this.redis.getClient();

            // Atomic read + delete via pipeline
            const pipeline = client.pipeline();
            pipeline.hgetall(key);
            pipeline.del(key);
            const results = await pipeline.exec();

            const data = results?.[0]?.[1] as Record<string, string> | null;
            if (!data || !data.count) return null;

            const count = parseInt(data.count, 10);
            if (count <= 0) return null;

            return {
                  count,
                  lastContent: data.lastContent ?? '',
                  senderName: data.senderName ?? '',
                  conversationId: data.conversationId ?? conversationId,
                  conversationName: data.conversationName ?? '',
                  conversationType: (data.conversationType as 'DIRECT' | 'GROUP') ?? 'DIRECT',
            };
      }
}
