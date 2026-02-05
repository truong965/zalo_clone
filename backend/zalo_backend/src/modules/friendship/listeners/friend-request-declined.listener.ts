import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import { FriendshipCacheHelper } from '../helpers/friendship-cache.helper';
import type { FriendshipRejectedPayload } from '@shared/events/contracts';
import { EventIdGenerator } from '@common/utils/event-id-generator';

/**
 * R6: FriendRequestDeclinedListener (Split Concern)
 *
 * Handles: friendship.declined event
 * Fired when: User B declines/rejects request from User A
 *
 * Responsibility (Single):
 * - Invalidate requester's pending requests cache
 * - Ensure consistent cache state
 *
 * NOT Responsibility:
 * - Socket notifications (handled by SocketListener)
 * - Email/push notifications (handled by NotificationDispatcher)
 * - Audit logging (handled by AuditLogger)
 */
@Injectable()
export class FriendRequestDeclinedListener extends IdempotentListener {
  constructor(
    prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super(prisma);
  }

  /**
   * Handle friendship.declined event
   *
   * Called when: User B declines request from User A
   *
   * Flow:
   * 1. Validate eventId
   * 2. Check idempotency
   * 3. Invalidate requester's pending requests cache
   * 4. Record processing success
   *
   * @param payload - FriendRequestRejectedEvent
   * @example
   * emit('friendship.declined', {
   *   eventId: 'uuid-v4',
   *   fromUserId: 'user-1',
   *   toUserId: 'user-2',
   *   action: 'REJECTED'
   * })
   */
  @OnEvent('friendship.request.declined')
  async handleFriendRequestDeclined(
    payload: FriendshipRejectedPayload,
  ): Promise<void> {
    const eventId = this.extractEventId(payload);
    if (!EventIdGenerator.isValid(eventId)) {
      this.logger.warn(`[FRIENDSHIP_DECLINED] Invalid eventId: ${eventId}`);
      return;
    }

    const fromUserId = (payload as Record<string, any>).fromUserId as string;
    const toUserId = (payload as Record<string, any>).toUserId as string;
    const action = (payload as Record<string, any>).action as string;

    return this.withIdempotency(
      eventId,
      async () => {
        this.logger.log(
          `[FRIENDSHIP_DECLINED] ${toUserId} declined request from ${fromUserId} (action: ${action})`,
        );

        try {
          // Invalidate requester's pending requests
          // They will refetch to see the declined status
          await FriendshipCacheHelper.invalidatePendingForUser(
            this.redis,
            fromUserId,
          );

          this.logger.debug(
            `[FRIENDSHIP_DECLINED] ✅ Cache invalidated for ${fromUserId}`,
          );
        } catch (error) {
          this.logger.error(
            `[FRIENDSHIP_DECLINED] ❌ Cache invalidation failed`,
            error,
          );
          throw error;
        }
      },
      'FriendRequestDeclinedListener',
    );
  }

  /**
   * Extract eventId from event with validation
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
    this.logger.warn(`[FRIENDSHIP_DECLINED] Generated eventId: ${generatedId}`);
    return generatedId;
  }
}
