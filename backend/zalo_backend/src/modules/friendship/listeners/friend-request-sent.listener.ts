import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import { FriendshipCacheHelper } from '../helpers/friendship-cache.helper';
import { FriendRequestSentEvent } from '../events/versioned-friendship-events';
import { EventIdGenerator } from '@common/utils/event-id-generator';

/**
 * R6: FriendRequestSentListener (Split Concern)
 *
 * Handles: friendship.request.sent event
 * Fired when: User A sends friend request to User B
 *
 * Responsibility (Single):
 * - Invalidate recipient's pending friend requests cache
 * - Ensure consistent cache state for UI queries
 *
 * NOT Responsibility:
 * - Socket notifications (handled by SocketListener)
 * - Email/push notifications (handled by NotificationDispatcher)
 * - Creating notification records (handled by NotificationService)
 * - Logging analytics (handled by AnalyticsLogger)
 *
 * Implementation:
 * - Uses IdempotentListener for duplicate prevention
 * - Uses RedisCacheFacade instead of direct RedisService
 * - Validates eventId using EventIdGenerator
 */
@Injectable()
export class FriendRequestSentListener extends IdempotentListener {
  constructor(
    prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super(prisma);
  }

  /**
   * Handle friendship.request.sent event
   *
   * Called when: User A sends friend request to User B
   *
   * Flow:
   * 1. Validate eventId from event
   * 2. Check if already processed (idempotency)
   * 3. Invalidate recipient's pending requests cache
   * 4. Record processing success
   *
   * @param payload - FriendRequestSentEvent
   * @example
   * emit('friendship.request.sent', {
   *   eventId: 'uuid-v4',
   *   fromUserId: 'user-1',
   *   toUserId: 'user-2'
   * })
   */
  @OnEvent('friendship.request.sent')
  async handleFriendRequestSent(
    payload: FriendRequestSentEvent,
  ): Promise<void> {
    // Extract eventId with validation
    const eventId = this.extractEventId(payload);
    if (!EventIdGenerator.isValid(eventId)) {
      this.logger.warn(`[FRIEND_REQUEST_SENT] Invalid eventId: ${eventId}`);
      return;
    }

    const fromUserId = (payload as Record<string, any>).fromUserId as string;
    const toUserId = (payload as Record<string, any>).toUserId as string;

    return this.withIdempotency(
      eventId,
      async () => {
        this.logger.log(
          `[FRIEND_REQUEST_SENT] User ${fromUserId} → ${toUserId}`,
        );

        // Invalidate recipient's pending requests cache
        // They will refetch latest list on next query
        try {
          await FriendshipCacheHelper.invalidatePendingForUser(
            this.redis,
            toUserId,
          );
          this.logger.debug(
            `[FRIEND_REQUEST_SENT] ✅ Cache invalidated for ${toUserId}`,
          );
        } catch (error) {
          this.logger.error(
            `[FRIEND_REQUEST_SENT] ❌ Cache invalidation failed`,
            error,
          );
          throw error; // Fail-fast: propagate to event emitter
        }
      },
      'FriendRequestSentListener',
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

    // Generate new eventId if missing or invalid
    const generatedId = EventIdGenerator.generate();
    this.logger.warn(`[FRIEND_REQUEST_SENT] Generated eventId: ${generatedId}`);
    return generatedId;
  }
}
