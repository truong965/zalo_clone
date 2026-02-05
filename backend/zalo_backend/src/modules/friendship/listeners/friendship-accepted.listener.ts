import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import { FriendshipCacheHelper } from '../helpers/friendship-cache.helper';
import type { FriendshipAcceptedPayload } from '@shared/events/contracts';
import { EventIdGenerator } from '@common/utils/event-id-generator';

/**
 * R6: FriendshipAcceptedListener (Split Concern)
 *
 * Handles: friendship.accepted event
 * Fired when: User B accepts friend request from User A
 *
 * Responsibility (Single):
 * - Invalidate friend lists for BOTH users
 * - Invalidate pending requests cache for BOTH users
 * - Ensure consistent cache state across both users
 *
 * NOT Responsibility:
 * - Creating conversations (handled by MessagingService via event)
 * - Socket notifications (handled by SocketListener)
 * - User notifications (handled by NotificationDispatcher)
 *
 * Idempotency:
 * - If same event (eventId) is processed twice, second call is skipped
 * - Cache invalidation is idempotent (safe to call multiple times)
 *
 * Implementation:
 * - Uses RedisCacheFacade for cache operations (not direct RedisService)
 * - Validates eventId before processing
 * - Tracks processing in ProcessedEvent table
 */
@Injectable()
export class FriendshipAcceptedListener extends IdempotentListener {
  constructor(
    prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super(prisma);
  }

  /**
   * Handle friendship.accepted event
   *
   * Called when: User B accepts request from User A (creates friendship)
   *
   * Flow:
   * 1. Validate eventId
   * 2. Check idempotency (skip if already processed)
   * 3. Invalidate BOTH users' friend lists
   * 4. Invalidate BOTH users' pending requests
   * 5. Record success in ProcessedEvent table
   *
   * @param payload - FriendshipAcceptedEvent
   * @example
   * emit('friendship.accepted', {
   *   eventId: 'uuid-v4',
   *   user1Id: 'user-1',
   *   user2Id: 'user-2',
   *   requesterId: 'user-1',
   *   acceptedBy: 'user-2'
   * })
   */
  @OnEvent('friendship.accepted')
  async handleFriendshipAccepted(
    payload: FriendshipAcceptedPayload,
  ): Promise<void> {
    const eventId = this.extractEventId(payload);
    if (!EventIdGenerator.isValid(eventId)) {
      this.logger.warn(`[FRIENDSHIP_ACCEPTED] Invalid eventId: ${eventId}`);
      return;
    }

    const user1Id = (payload as Record<string, any>).user1Id as string;
    const user2Id = (payload as Record<string, any>).user2Id as string;
    const requesterId = (payload as Record<string, any>).requesterId as string;
    const acceptedBy = (payload as Record<string, any>).acceptedBy as string;

    return this.withIdempotency(
      eventId,
      async () => {
        this.logger.log(
          `[FRIENDSHIP_ACCEPTED] ${requesterId} ↔ ${acceptedBy} (users: ${user1Id}, ${user2Id})`,
        );

        try {
          // Invalidate friend lists and pending requests for BOTH users
          await FriendshipCacheHelper.invalidateForUsers(
            this.redis,
            user1Id,
            user2Id,
          );

          this.logger.debug(
            `[FRIENDSHIP_ACCEPTED] ✅ Cache invalidated for both users`,
          );
        } catch (error) {
          this.logger.error(
            `[FRIENDSHIP_ACCEPTED] ❌ Cache invalidation failed`,
            error,
          );
          throw error;
        }
      },
      'FriendshipAcceptedListener',
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
    this.logger.warn(`[FRIENDSHIP_ACCEPTED] Generated eventId: ${generatedId}`);
    return generatedId;
  }
}
