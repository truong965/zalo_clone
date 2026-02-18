/**
 * BlockService - REFACTORED (Event-Driven Architecture)
 *
 * CHANGES FROM ORIGINAL:
 * ✅ Removed cache invalidation (moved to BlockEventHandler)
 * ✅ Removed friendship deletion (moved to FriendshipBlockListener)
 * ✅ Removed group request deletion (not needed per requirements)
 * ✅ Service ONLY: Create/Delete block record + Emit event
 * ✅ All cascade operations handled by independent listeners
 *
 * Responsibilities (Single Responsibility Principle):
 * 1. Block/unblock users (database operations)
 * 2. Check block status (read queries with cache)
 * 3. Emit domain events (user.blocked, user.unblocked)
 * 4. Query blocked users list (pagination)
 *
 * What this service does NOT do (moved to listeners):
 * ❌ Cache invalidation → BlockEventHandler
 * ❌ Delete friendships → FriendshipBlockListener
 * ❌ Delete group requests → Removed (per requirements)
 * ❌ Archive conversations → Not needed (per requirements)
 * ❌ Socket disconnect → SocketBlockListener (other module)
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import type { IBlockRepository } from './repositories/block.repository.interface';
import { BLOCK_REPOSITORY } from './repositories/block.repository.interface';
import { RedisService } from '@modules/redis/redis.service';
import { Block, Prisma } from '@prisma/client';
import {
  BlockUserDto,
  BlockResponseDto,
  BlockedUserDto,
  BlockRelation,
} from './dto/block.dto';
import { SelfActionException } from '@shared/errors';
import type {
  UserBlockedEventPayload,
  UserUnblockedEventPayload,
} from '@shared/events/contracts';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import socialConfig from '@config/social.config';
import type { ConfigType } from '@nestjs/config';
import { CursorPaginationDto } from '@common/dto/cursor-pagination.dto';
import { CursorPaginatedResult } from '@common/interfaces/paginated-result.interface';
import { CursorPaginationHelper } from '@common/utils/cursor-pagination.helper';
import { PermissionActionType } from '@common/constants/permission-actions.constant';
import { EventIdGenerator } from '@common/utils/event-id-generator';
import { v4 as uuidv4 } from 'uuid';
import { EventPublisher } from '@shared/events';
import { UserBlockedEvent, UserUnblockedEvent } from './events/block.events';

@Injectable()
export class BlockService {
  private readonly logger = new Logger(BlockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventPublisher: EventPublisher,
    @Inject(BLOCK_REPOSITORY)
    private readonly blockRepository: IBlockRepository,
    @Inject(socialConfig.KEY)
    private readonly config: ConfigType<typeof socialConfig>,
  ) { }

  /**
   * Block a user (Idempotent)
   *
   * REFACTORED: Simplified to single responsibility
   *
   * Before:
   * - Create block ✓
   * - Invalidate cache ✗ (moved to listener)
   * - Delete friendships ✗ (moved to listener)
   * - Delete group requests ✗ (removed)
   * - Emit event ✓
   *
   * After:
   * - Create block ✓
   * - Emit event ✓
   *
   * Cascade operations handled by listeners:
   * - BlockEventHandler: Cache invalidation
   * - FriendshipBlockListener: Soft delete friendship
   *
   * P1.1 CHANGE: Idempotent - handles concurrent duplicate attempts gracefully
   * - Database unique constraint prevents duplicates
   * - Returns existing block if already blocked
   */
  async blockUser(
    blockerId: string,
    dto: BlockUserDto,
  ): Promise<BlockResponseDto> {
    const { targetUserId, reason } = dto;

    // Validation: Cannot block self
    if (blockerId === targetUserId) {
      throw new SelfActionException('Cannot block yourself');
    }

    try {
      // STEP 1: Create block record (atomic operation)
      const block = await this.prisma.block.create({
        data: {
          blockerId,
          blockedId: targetUserId,
          reason,
        },
      });

      this.logger.log(`✅ Block created: ${blockerId} → ${targetUserId}`);

      // STEP 2: Emit event (listeners will handle cascade operations)
      // Event listeners (independent, parallel):
      // - BlockEventHandler: Cache invalidation
      // - FriendshipBlockListener: Soft delete friendship
      // - SocketBlockListener: Disconnect sockets (if needed)
      const blockedEvent: UserBlockedEventPayload = {
        eventId: EventIdGenerator.generate(),
        eventType: 'USER_BLOCKED',
        version: 1,
        timestamp: new Date(),
        source: 'BlockModule',
        aggregateId: blockerId,
        correlationId: uuidv4(),
        blockerId,
        blockedId: targetUserId,
        blockId: block.id,
        reason,
      };

      await this.eventPublisher.publish(
        new UserBlockedEvent(blockerId, targetUserId, block.id, reason),
        { correlationId: blockedEvent.correlationId },
      );

      this.logger.debug(`📢 Event published: user.blocked (${block.id})`);

      return this.mapToResponseDto(block);
    } catch (error) {
      // Handle unique constraint violation (P2002 = duplicate block)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        error.meta?.target &&
        Array.isArray(error.meta.target) &&
        error.meta.target.includes('blockerId')
      ) {
        // Already blocked - idempotent behavior: return existing block
        this.logger.log(
          `⚠️  Already blocked (idempotent): ${blockerId} → ${targetUserId}`,
        );

        const existingBlock = await this.blockRepository.findByPair(
          blockerId,
          targetUserId,
        );
        if (existingBlock) {
          return this.mapToResponseDto(existingBlock);
        }
      }

      // Re-throw all other errors
      throw error;
    }
  }

  /**
   * Unblock a user (Idempotent)
   *
   * PHASE 3: Get blockId BEFORE delete, pass to UserUnblockedEvent (per plan).
   * Listeners (e.g. FriendshipBlockListener) need blockId for restore logic.
   */
  async unblockUser(blockerId: string, targetUserId: string): Promise<void> {
    if (blockerId === targetUserId) {
      throw new SelfActionException('Cannot unblock yourself');
    }

    // STEP 1: Get block record BEFORE delete (plan: truyền blockId vào UserUnblockedEvent)
    const block = await this.blockRepository.findByPair(
      blockerId,
      targetUserId,
    );

    if (!block) {
      this.logger.log(
        `⚠️  Already unblocked (idempotent): ${blockerId} → ${targetUserId}`,
      );
      return;
    }

    const blockId = block.id;

    // STEP 2: Delete block record
    await this.prisma.block.delete({
      where: { id: blockId },
    });

    this.logger.log(`✅ Unblocked: ${blockerId} → ${targetUserId}`);

    // STEP 3: Emit event with blockId (listeners handle cache invalidation, friendship restore)
    const unblockedEvent: UserUnblockedEventPayload = {
      eventId: EventIdGenerator.generate(),
      eventType: 'USER_UNBLOCKED',
      version: 1,
      timestamp: new Date(),
      source: 'BlockModule',
      aggregateId: blockerId,
      correlationId: uuidv4(),
      blockerId,
      blockedId: targetUserId,
      blockId,
    };

    await this.eventPublisher.publish(
      new UserUnblockedEvent(blockerId, targetUserId, blockId),
      { correlationId: unblockedEvent.correlationId },
    );

    this.logger.debug(
      `📢 Event published: user.unblocked (blockId: ${blockId})`,
    );
  }

  // ============================================================================
  // QUERY METHODS (Read operations with cache-aside pattern)
  // ============================================================================

  /**
   * Batch get block status for multiple users
   * Moved from SocialFacade to keep query logic in Service layer
   */
  async getBatchBlockStatus(
    requesterId: string,
    targetUserIds: string[],
  ): Promise<Map<string, BlockRelation>> {
    const resultMap = new Map<string, BlockRelation>();

    // Initialize default NONE
    targetUserIds.forEach((id) => resultMap.set(id, BlockRelation.NONE));

    if (targetUserIds.length === 0) return resultMap;

    // Optimized Query: Fetch all relevant blocks in one go
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: requesterId, blockedId: { in: targetUserIds } }, // I blocked them
          { blockerId: { in: targetUserIds }, blockedId: requesterId }, // They blocked me
        ],
      },
      select: {
        blockerId: true,
        blockedId: true,
      },
    });

    // Process logic in memory
    for (const block of blocks) {
      const isMyBlock = block.blockerId === requesterId;
      const otherUserId = isMyBlock ? block.blockedId : block.blockerId;

      const currentStatus = resultMap.get(otherUserId) || BlockRelation.NONE;

      if (currentStatus === BlockRelation.NONE) {
        resultMap.set(
          otherUserId,
          isMyBlock
            ? BlockRelation.BLOCKED_BY_ME
            : BlockRelation.BLOCKED_BY_THEM,
        );
      } else {
        // If already has status (e.g. BLOCKED_BY_ME) and finds opposite → BOTH
        resultMap.set(otherUserId, BlockRelation.BOTH);
      }
    }

    return resultMap;
  }

  /**
   * Check if user1 has blocked user2 (or vice versa)
   * Uses cache-aside pattern with short TTL
   *
   * DEPRECATED: Use isBlockedByMe() or isBlockedByThem() for directionality
   */
  async isBlocked(userId1: string, userId2: string): Promise<boolean> {
    // Try cache first
    const cacheKey = RedisKeyBuilder.socialBlock(userId1, userId2);
    const cached = await this.redis.get(cacheKey);

    if (cached !== null) {
      return cached === '1';
    }

    // Cache miss - query database
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId1, blockedId: userId2 },
          { blockerId: userId2, blockedId: userId1 },
        ],
      },
      select: { id: true },
    });

    const isBlocked = !!block;

    // Cache result with short TTL
    await this.redis.setex(
      cacheKey,
      this.config.ttl.block,
      isBlocked ? '1' : '0',
    );

    return isBlocked;
  }

  /**
   * Check if I have blocked someone
   * Uses cache-aside pattern with short TTL
   */
  async isBlockedByMe(myId: string, themId: string): Promise<boolean> {
    const cacheKey = RedisKeyBuilder.socialBlock(myId, themId);
    const cached = await this.redis.get(cacheKey);

    if (cached !== null) {
      return cached === '1';
    }

    const block = await this.prisma.block.findFirst({
      where: {
        blockerId: myId,
        blockedId: themId,
      },
      select: { id: true },
    });

    const isBlocked = !!block;

    await this.redis.setex(
      cacheKey,
      this.config.ttl.block,
      isBlocked ? '1' : '0',
    );

    return isBlocked;
  }

  /**
   * Check if someone has blocked me
   * Uses cache-aside pattern with short TTL
   */
  async isBlockedByThem(themId: string, myId: string): Promise<boolean> {
    return this.isBlockedByMe(themId, myId);
  }

  /**
   * Get list of users I blocked (with cursor pagination)
   *
   * Infinity scroll implementation:
   * - Cursor = last block ID from previous page
   * - Efficient for large datasets (no OFFSET)
   */
  async getBlockedList(
    userId: string,
    query: CursorPaginationDto,
  ): Promise<CursorPaginatedResult<BlockedUserDto>> {
    const { limit = 20, cursor } = query;

    const blocks = await this.prisma.block.findMany({
      where: {
        blockerId: userId,
      },
      ...CursorPaginationHelper.buildPrismaParams(limit, cursor),
      orderBy: { createdAt: 'desc' },
      include: {
        blocked: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return CursorPaginationHelper.buildResult({
      items: blocks,
      limit,
      getCursor: (block) => block.id,
      mapToDto: (block) =>
        ({
          blockId: block.id,
          userId: block.blocked.id,
          displayName: block.blocked.displayName,
          avatarUrl: block.blocked.avatarUrl ?? undefined,
          blockedAt: block.createdAt,
          reason: block.reason ?? undefined,
        }) as BlockedUserDto,
    });
  }

  /**
   * Get list of users who blocked me
   *
   * Reverse lookup - useful for:
   * - Privacy checks
   * - Deciding visibility of content
   * - Preventing interactions with users who blocked you
   *
   * Note: Returns only user IDs (no pagination - assumed small list)
   */
  async getBlockedByUsers(userId: string): Promise<string[]> {
    const blocks = await this.prisma.block.findMany({
      where: {
        blockedId: userId,
      },
      select: {
        blockerId: true,
      },
    });

    return blocks.map((block) => block.blockerId);
  }

  /**
   * Batch check if I have blocked multiple users
   * Optimized query to avoid N+1 problem
   */
  async batchIsBlockedByMe(
    requesterId: string,
    targetUserIds: string[],
  ): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();

    if (targetUserIds.length === 0) return result;

    // 1. Try cache first (batch get)
    const cacheKeys = targetUserIds.map((id) =>
      RedisKeyBuilder.socialBlock(requesterId, id),
    );

    const cachedValues = await this.redis.mget(cacheKeys);
    const missingUserIds: string[] = [];

    for (let i = 0; i < targetUserIds.length; i++) {
      const userId = targetUserIds[i];
      const cachedValue = cachedValues[i];

      if (cachedValue !== null) {
        result.set(userId, cachedValue === '1');
      } else {
        missingUserIds.push(userId);
      }
    }

    // 2. Query database for cache misses
    if (missingUserIds.length > 0) {
      const blocks = await this.prisma.block.findMany({
        where: {
          blockerId: requesterId,
          blockedId: { in: missingUserIds },
        },
        select: {
          blockerId: true,
          blockedId: true,
        },
      });

      // Process results into map
      const blockedSet = new Set<string>();
      for (const block of blocks) {
        if (block.blockerId === requesterId) {
          blockedSet.add(block.blockedId);
        }
      }

      // 3. Cache results and populate result map
      const pipeline = this.redis.getClient().pipeline();
      for (const userId of missingUserIds) {
        const isBlocked = blockedSet.has(userId);
        const cacheKey = RedisKeyBuilder.socialBlock(requesterId, userId);
        pipeline.setex(cacheKey, this.config.ttl.block, isBlocked ? '1' : '0');
        result.set(userId, isBlocked);
      }
      await pipeline.exec();
    }

    return result;
  }

  /**
   * Cache block status (called by PrivacyService after check)
   * Ensures single source of truth for permission results
   */
  async cacheBlockStatus(
    userId1: string,
    userId2: string,
    isBlocked: boolean,
  ): Promise<void> {
    const cacheKey = RedisKeyBuilder.socialBlock(userId1, userId2);
    await this.redis.setex(
      cacheKey,
      this.config.ttl.block,
      isBlocked ? '1' : '0',
    );
  }

  /**
   * Cache permission result with TTL
   * Called by: PrivacyService after computing permission result
   */
  async cachePermissionResult(
    type: PermissionActionType,
    userId1: string,
    userId2: string,
    result: boolean,
  ): Promise<void> {
    const cacheKey = RedisKeyBuilder.socialPermission(type, userId1, userId2);
    await this.redis.setex(
      cacheKey,
      this.config.ttl.permission, // 5 minutes (300 seconds)
      result ? '1' : '0',
    );
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Map Block entity to response DTO
   */
  private mapToResponseDto(block: Block): BlockResponseDto {
    return {
      id: block.id,
      blockerId: block.blockerId,
      blockedId: block.blockedId,
      reason: block.reason ?? undefined,
      createdAt: block.createdAt,
    };
  }
}
