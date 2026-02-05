import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType } from '@prisma/client';
import { RedisService } from '@modules/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { ALL_PERMISSION_ACTIONS } from '@common/constants/permission-actions.constant';
import {
  UserBlockedEvent,
  UserUnblockedEvent,
} from '@modules/block/events/versioned-events';

/**
 * PrivacyBlockListener (PHASE 7 - EVENT-DRIVEN REFACTORING)
 *
 * PURPOSE: Handle block-related events to maintain privacy cache consistency
 *
 * RESPONSIBILITY (SINGLE):
 *   - Invalidate permission cache when users are blocked/unblocked
 *   - Ensures Privacy checks don't serve stale data
 *
 * LISTENS TO:
 *   - user.blocked: Invalidate all permission caches for this user pair
 *   - user.unblocked: Invalidate all permission caches for this user pair
 *
 * DECOUPLING:
 *   - ✅ NO BlockService injection (breaks RULE 9)
 *   - ✅ Reactive to events, not imperative calls
 *   - ✅ Idempotent (handles duplicate events)
 *
 * CACHING LOGIC:
 *   - BlockService maintains block status cache (redis key: social:block:user1:user2)
 *   - PrivacyService maintains permission cache (redis key: social:permission:action:user1:user2)
 *   - When user.blocked/unblocked → invalidate BOTH caches
 *
 * Event-driven flow:
 *   user.blocked event (from BlockService) ←→ PrivacyBlockListener
 *   → Invalidates permission caches
 *   → Privacy queries fall back to DB + event state
 */
@Injectable()
export class PrivacyBlockListener {
  private readonly logger = new Logger(PrivacyBlockListener.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Handle user.blocked event
   *
   * Invalidates:
   *   1. Block status cache: social:block:blockerId:blockedId
   *   2. Permission caches: social:permission:{message|call|profile}:*
   */
  @OnEvent('user.blocked')
  async handleUserBlocked(event: UserBlockedEvent): Promise<void> {
    const { blockerId, blockedId } = event;
    const eventId = event.eventId;
    const handlerId = this.constructor.name;

    try {
      // Idempotency check
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );
      if (alreadyProcessed) {
        this.logger.debug(
          `[PRIVACY-BLOCK] Skipping duplicate block event: ${eventId}`,
        );
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[PRIVACY-BLOCK] Idempotency check failed, proceeding`,
        idempotencyError,
      );
    }

    this.logger.log(
      `[PRIVACY-BLOCK] Invalidating permission cache: ${blockerId} blocked ${blockedId}`,
    );

    // Invalidate permission caches (Block module's BlockCacheListener handles block cache)
    await this.invalidatePermissionCaches(blockerId, blockedId);

    await this.idempotency.recordProcessed(
      eventId,
      handlerId,
      EventType.USER_BLOCKED,
      event.correlationId,
      event.version ?? 1,
    );

    this.logger.debug(`[PRIVACY-BLOCK] Cache invalidated for block event`);
  }

  /**
   * Handle user.unblocked event
   *
   * Same cache invalidation as block event
   * (Permissions need to be recalculated)
   */
  @OnEvent('user.unblocked')
  async handleUserUnblocked(event: UserUnblockedEvent): Promise<void> {
    const { blockerId, blockedId } = event;
    const eventId = event.eventId;
    const handlerId = this.constructor.name;

    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );
      if (alreadyProcessed) {
        this.logger.debug(
          `[PRIVACY-BLOCK] Skipping duplicate unblock event: ${eventId}`,
        );
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[PRIVACY-BLOCK] Idempotency check failed, proceeding`,
        idempotencyError,
      );
    }

    this.logger.log(
      `[PRIVACY-BLOCK] Invalidating permission cache: ${blockerId} unblocked ${blockedId}`,
    );

    await this.invalidatePermissionCaches(blockerId, blockedId);

    await this.idempotency.recordProcessed(
      eventId,
      handlerId,
      EventType.USER_UNBLOCKED,
      event.correlationId,
      event.version ?? 1,
    );

    this.logger.debug(`[PRIVACY-BLOCK] Cache invalidated for unblock event`);
  }

  /**
   * Invalidate all permission caches between two users (both directions)
   */
  private async invalidatePermissionCaches(
    userId1: string,
    userId2: string,
  ): Promise<void> {
    const permissionKeys1 = ALL_PERMISSION_ACTIONS.map((action) =>
      RedisKeyBuilder.socialPermission(action, userId1, userId2),
    );

    const permissionKeys2 = ALL_PERMISSION_ACTIONS.map((action) =>
      RedisKeyBuilder.socialPermission(action, userId2, userId1),
    );

    const allKeys = [...permissionKeys1, ...permissionKeys2];

    await Promise.all(
      allKeys.map((key) =>
        this.redisService.del(key).catch((err) => {
          this.logger.warn(
            `[PRIVACY-BLOCK] Failed to delete cache key: ${key}`,
            err,
          );
        }),
      ),
    );
  }
}
