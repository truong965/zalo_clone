import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import { FriendshipCacheHelper } from '../helpers/friendship-cache.helper';
import type { UnfriendedPayload } from '@shared/events/contracts';
import { EventIdGenerator } from '@common/utils/event-id-generator';

/**
 * R6: UnfriendedListener (Split Concern)
 *
 * Handles: friendship.unfriended event
 * Fired when: User A or User B removes accepted friendship (soft delete)
 *
 * Responsibility (Single):
 * - Invalidate friend lists for BOTH users
 * - Invalidate call history for BOTH users
 * - Clear any related caches
 *
 * NOT Responsibility:
 * - Terminating active calls (handled by CallEndListener)
 * - Socket notifications (handled by SocketListener)
 * - User notifications (handled by NotificationDispatcher)
 *
 * Race Condition Protection:
 * - FriendshipService.removeFriendship() holds distributed lock
 * - This listener executes inside lock protection
 * - No race condition possible
 *
 * Implementation:
 * - Uses RedisCacheFacade for dependency injection
 * - Validates eventId using EventIdGenerator
 * - Tracks processing for idempotency
 */
@Injectable()
export class UnfriendedListener extends IdempotentListener {
  constructor(
    prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super(prisma);
  }

  /**
   * Handle friendship.unfriended event
   *
   * Called when: User A or User B removes their friendship
   *
   * Flow:
   * 1. Validate eventId
   * 2. Check idempotency (skip if already processed)
   * 3. Invalidate BOTH users' friend lists
   * 4. Invalidate BOTH users' call histories
   * 5. Record success in ProcessedEvent table
   *
   * Note: This is protected by distributed lock in FriendshipService
   * so race conditions are impossible.
   *
   * @param payload - UnfriendedEvent
   * @example
   * emit('friendship.unfriended', {
   *   eventId: 'uuid-v4',
   *   initiatedBy: 'user-1',
   *   user1Id: 'user-1',
   *   user2Id: 'user-2'
   * })
   */
  @OnEvent('friendship.unfriended')
  async handleUnfriended(payload: UnfriendedPayload): Promise<void> {
    const eventId = this.extractEventId(payload);
    if (!EventIdGenerator.isValid(eventId)) {
      this.logger.warn(`[UNFRIENDED] Invalid eventId: ${eventId}`);
      return;
    }

    const initiatedBy = (payload as Record<string, any>).initiatedBy as string;
    const user1Id = (payload as Record<string, any>).user1Id as string;
    const user2Id = (payload as Record<string, any>).user2Id as string;

    return this.withIdempotency(
      eventId,
      async () => {
        const otherUserId = user1Id === initiatedBy ? user2Id : user1Id;

        this.logger.log(
          `[UNFRIENDED] ${initiatedBy} unfriended ${otherUserId}`,
        );

        try {
          // Invalidate friend lists for BOTH users
          await FriendshipCacheHelper.invalidateForUsers(
            this.redis,
            user1Id,
            user2Id,
          );
          await FriendshipCacheHelper.invalidateCallHistories(this.redis, [
            user1Id,
            user2Id,
          ]);

          this.logger.debug(
            `[UNFRIENDED] ✅ Cache invalidated for both users (distributed lock protected)`,
          );
        } catch (error) {
          this.logger.error(`[UNFRIENDED] ❌ Cache invalidation failed`, error);
          throw error;
        }
      },
      'UnfriendedListener',
    );
  }

  /**
   * Extract eventId from event with validation
   * Falls back to generating new ID if missing
   *
   * @param payload - Event payload
   * @returns eventId string
   */
  private extractEventId(payload: Record<string, any>): string {
    const eventIdValue = payload?.eventId as string | undefined;
    if (
      typeof eventIdValue === 'string' &&
      EventIdGenerator.isValid(eventIdValue)
    ) {
      return eventIdValue;
    }

    const generatedId = EventIdGenerator.generate();
    this.logger.warn(`[UNFRIENDED] Generated eventId: ${generatedId}`);
    return generatedId;
  }
}
