import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType } from '@prisma/client';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import { RedisService } from '@modules/redis/redis.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import type {
  UserBlockedEventPayload,
  UserUnblockedEventPayload,
} from '@shared/events/contracts';

/**
 * BlockCacheListener - PHASE 3 (renamed from BlockEventHandler)
 *
 * Responsibility: Cache invalidation when block/unblock occurs.
 * - Invalidate block status cache (socialBlock)
 * - Invalidate permission caches (message, call, profile)
 *
 * Does NOT: Delete friendships (FriendshipBlockListener), disconnect sockets.
 */
@Injectable()
export class BlockCacheListener {
  private readonly logger = new Logger(BlockCacheListener.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @OnEvent('user.blocked')
  async handleUserBlocked(event: UserBlockedEventPayload): Promise<void> {
    const { blockerId, blockedId } = event;
    const eventId = event.eventId;
    const handlerId = this.constructor.name;

    this.logger.log(
      `[BLOCK] Cache invalidation: ${blockerId} blocked ${blockedId} (${eventId})`,
    );

    if (await this.idempotency.isProcessed(eventId, handlerId)) {
      this.logger.debug(`[BLOCK] Skipping duplicate: ${eventId}`);
      return;
    }

    try {
      const keys = this.getPermissionCacheKeys(blockerId, blockedId);
      await this.redisService.mDel(keys);

      await this.idempotency.recordProcessed(
        eventId,
        handlerId,
        EventType.USER_BLOCKED,
        event.correlationId,
        event.version,
      );

      this.logger.debug(`[BLOCK] ✅ Invalidated ${keys.length} keys`);
    } catch (error) {
      this.logger.error(`[BLOCK] ❌ Cache invalidation failed`, {
        blockerId,
        blockedId,
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.USER_BLOCKED,
          undefined,
          event.version,
        );
      } catch {
        /* ignore */
      }
      throw error;
    }
  }

  @OnEvent('user.unblocked')
  async handleUserUnblocked(event: UserUnblockedEventPayload): Promise<void> {
    const { blockerId, blockedId } = event;
    const eventId = event.eventId;
    const handlerId = this.constructor.name;

    this.logger.log(
      `[UNBLOCK] Cache invalidation: ${blockerId} unblocked ${blockedId} (${eventId})`,
    );

    if (await this.idempotency.isProcessed(eventId, handlerId)) {
      this.logger.debug(`[UNBLOCK] Skipping duplicate: ${eventId}`);
      return;
    }

    try {
      const keys = this.getPermissionCacheKeys(blockerId, blockedId);
      await this.redisService.mDel(keys);

      await this.idempotency.recordProcessed(
        eventId,
        handlerId,
        EventType.USER_UNBLOCKED,
        event.correlationId,
        event.version,
      );

      this.logger.debug(`[UNBLOCK] ✅ Invalidated ${keys.length} keys`);
    } catch (error) {
      this.logger.error(`[UNBLOCK] ❌ Cache invalidation failed`, {
        blockerId,
        blockedId,
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.USER_UNBLOCKED,
          undefined,
          event.version,
        );
      } catch {
        /* ignore */
      }
      throw error;
    }
  }

  private getPermissionCacheKeys(
    blockerId: string,
    blockedId: string,
  ): string[] {
    const actions = ['message', 'call', 'profile'] as const;
    const keys = [RedisKeyBuilder.socialBlock(blockerId, blockedId)];

    for (const action of actions) {
      keys.push(
        RedisKeyBuilder.socialPermission(action, blockerId, blockedId),
        RedisKeyBuilder.socialPermission(action, blockedId, blockerId),
      );
    }
    return keys;
  }
}
