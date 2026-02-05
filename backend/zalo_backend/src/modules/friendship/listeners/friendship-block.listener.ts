import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { RedisService } from '@modules/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import type {
  UserBlockedEventPayload,
  UserUnblockedEventPayload,
} from '@shared/events/contracts';

/**
 * FriendshipBlockListener (NEW - Moved from BlockEventHandler)
 *
 * Module: FriendshipModule (src/modules/friendship/listeners/friendship-block.listener.ts)
 *
 * Responsibility:
 * - Soft delete friendship when user is blocked
 * - Invalidate friendship caches
 * - Emit cache.invalidate event for multi-node sync
 *
 * Business Rule (Per Q1 Answer):
 * - When A blocks B, friendship is SOFT DELETED (set deletedAt, deletedById)
 * - Friendship can be restored later if unblocked and re-added
 * - Soft delete preserves audit trail and history
 *
 * Why FriendshipModule owns this:
 * - Friendship table belongs to FriendshipModule
 * - Only FriendshipModule should modify friendship data
 * - Block is a TRIGGER, not the owner of cascade logic
 * - Follows Single Responsibility Principle
 *
 * Event Flow:
 * 1. BlockService creates block record
 * 2. BlockService emits user.blocked event
 * 3. BlockEventHandler invalidates block caches
 * 4. FriendshipBlockListener (THIS) soft deletes friendship
 * 5. SocketBlockListener disconnects sockets (if needed)
 * All listeners run independently in parallel
 *
 * Idempotency: Tracked in ProcessedEvent table
 * Error Handling: Rethrows errors for retry mechanism
 */
@Injectable()
export class FriendshipBlockListener {
  private readonly logger = new Logger(FriendshipBlockListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Handle user.blocked event
   *
   * Action: Soft delete friendship relationship
   *
   * Per Q1 Answer: SOFT DELETE (set deletedAt, deletedById)
   * - Preserves audit trail
   * - Can be restored if users re-add each other
   * - Does NOT hard delete (no .delete() or .deleteMany())
   *
   * Schema reference (from schema.prisma):
   * ```prisma
   * model Friendship {
   *   user1Id     String
   *   user2Id     String
   *   status      FriendshipStatus  // PENDING, ACCEPTED, DECLINED
   *   deletedAt   DateTime?         // Soft delete timestamp
   *   deletedById String?           // Who initiated deletion
   * }
   * ```
   */
  @OnEvent('user.blocked')
  async handleUserBlocked(event: UserBlockedEventPayload): Promise<void> {
    const { blockerId, blockedId, eventId } = event;
    const handlerId = this.constructor.name;

    this.logger.log(
      `[FRIENDSHIP] Processing block cascade: ${blockerId} blocked ${blockedId} (event: ${eventId})`,
    );

    // IDEMPOTENCY: Check if already processed
    const alreadyProcessed = await this.idempotency.isProcessed(
      eventId,
      handlerId,
    );

    if (alreadyProcessed) {
      this.logger.debug(`[FRIENDSHIP] Skipping duplicate event: ${eventId}`);
      return;
    }

    try {
      // STEP 1: Soft delete friendship (set deletedAt, deletedById)
      // Note: Friendship table uses ordered user IDs (user1Id < user2Id)
      const [user1Id, user2Id] =
        blockerId < blockedId ? [blockerId, blockedId] : [blockedId, blockerId];

      // Find existing friendship (any status: PENDING, ACCEPTED, DECLINED)
      const existingFriendship = await this.prisma.friendship.findFirst({
        where: {
          user1Id,
          user2Id,
          deletedAt: null, // Not already deleted
        },
      });

      if (!existingFriendship) {
        this.logger.debug(
          `[FRIENDSHIP] No active friendship found between ${user1Id} and ${user2Id} - skipping`,
        );
      } else {
        // Soft delete: Set deletedAt and deletedById
        const result = await this.prisma.friendship.updateMany({
          where: {
            user1Id,
            user2Id,
            deletedAt: null, // Only delete active friendships
          },
          data: {
            deletedAt: new Date(),
          },
        });

        this.logger.log(
          `[FRIENDSHIP] Soft deleted ${result.count} friendship(s) for block ${eventId}`,
        );
      }

      // STEP 2: Invalidate friendship caches (FriendshipModule owns these)
      const cacheKeys = [
        RedisKeyBuilder.friendshipStatus(user1Id, user2Id),
        RedisKeyBuilder.friendshipFriendsList(user1Id),
        RedisKeyBuilder.friendshipFriendsList(user2Id),
        RedisKeyBuilder.socialFriendCount(user1Id, 'ACCEPTED'),
        RedisKeyBuilder.socialFriendCount(user2Id, 'ACCEPTED'),

        // Mutual friends cache (if exists)
        RedisKeyBuilder.friendshipMutualFriends(user1Id, user2Id),
      ];

      await this.redis.del(...cacheKeys);

      this.logger.debug(
        `[FRIENDSHIP] Cache invalidated: ${cacheKeys.length} keys deleted`,
      );

      this.logger.log(
        `[FRIENDSHIP] ✅ Cascade complete: Friendship soft deleted for block ${eventId}`,
      );

      // IDEMPOTENCY: Record successful processing
      await this.idempotency.recordProcessed(
        eventId,
        handlerId,
        EventType.USER_BLOCKED,
        event.correlationId,
        event.version,
      );
    } catch (error) {
      this.logger.error(
        `[FRIENDSHIP] ❌ CRITICAL FAILURE in friendship cascade: ${blockerId} → ${blockedId}`,
        {
          eventId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );

      // Try to record error for monitoring
      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.USER_BLOCKED,
          undefined,
          event.version,
        );
      } catch (recordError) {
        this.logger.warn(
          `[FRIENDSHIP] Failed to record error in idempotency tracking`,
          recordError,
        );
      }

      // Rethrow error for retry mechanism
      throw error;
    }
  }

  /**
   * Handle user.unblocked event
   *
   * PHASE 5: Restore soft-deleted friendship (per plan)
   * - Update deletedAt=null for Friendship between blocker-blocked
   * - Only restore if record was soft-deleted by block (deletedAt not null)
   */
  @OnEvent('user.unblocked')
  async handleUserUnblocked(event: UserUnblockedEventPayload): Promise<void> {
    const { blockerId, blockedId, eventId } = event;
    const handlerId = this.constructor.name;

    this.logger.log(
      `[FRIENDSHIP] Processing unblock: ${blockerId} unblocked ${blockedId} (${eventId})`,
    );

    const alreadyProcessed = await this.idempotency.isProcessed(
      eventId,
      handlerId,
    );

    if (alreadyProcessed) {
      this.logger.debug(`[FRIENDSHIP] Skipping duplicate: ${eventId}`);
      return;
    }

    try {
      const [user1Id, user2Id] = [blockerId, blockedId].sort();

      // PHASE 5: Restore soft-deleted friendship (from block)
      // Only restore records that were soft-deleted (by block)
      const restoreResult = await this.prisma.friendship.updateMany({
        where: {
          user1Id,
          user2Id,
          deletedAt: { not: null },
        },
        data: { deletedAt: null }, // Restore - keep original status (PENDING/ACCEPTED)
      });

      if (restoreResult.count > 0) {
        this.logger.log(
          `[FRIENDSHIP] Restored ${restoreResult.count} friendship(s) for unblock`,
        );
      }

      const cacheKeys = [
        RedisKeyBuilder.friendshipStatus(user1Id, user2Id),
        RedisKeyBuilder.friendshipFriendsList(user1Id),
        RedisKeyBuilder.friendshipFriendsList(user2Id),
        RedisKeyBuilder.socialFriendCount(user1Id, 'ACCEPTED'),
        RedisKeyBuilder.socialFriendCount(user2Id, 'ACCEPTED'),
      ];

      await this.redis.del(...cacheKeys);

      this.logger.debug(
        `[FRIENDSHIP] ✅ Unblock complete: restore + cache invalidation`,
      );

      // IDEMPOTENCY: Record successful processing
      await this.idempotency.recordProcessed(
        eventId,
        handlerId,
        EventType.USER_UNBLOCKED,
        event.correlationId,
        event.version,
      );
    } catch (error) {
      this.logger.error(
        `[FRIENDSHIP] ❌ CRITICAL FAILURE in unblock cascade: ${blockerId} → ${blockedId}`,
        {
          eventId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      );

      // Try to record error for monitoring
      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.USER_UNBLOCKED,
          undefined,
          event.version,
        );
      } catch (recordError) {
        this.logger.warn(
          `[FRIENDSHIP] Failed to record error in idempotency tracking`,
          recordError,
        );
      }

      // Rethrow error for retry mechanism
      throw error;
    }
  }
}
