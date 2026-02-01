/**
 * BlockService - Core service for managing user blocks
 *
 * Responsibilities:
 * - Block/unblock users
 * - Check block status
 * - Query blocked users list
 * - Handle cascade operations (delete friendships, group requests)
 * - Manage cache invalidation
 * - Publish block events
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RedisService } from 'src/modules/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Block, JoinRequestStatus } from '@prisma/client';
import {
  BlockUserDto,
  BlockResponseDto,
  BlockedUserDto,
} from '../dto/block-privacy.dto';
import {
  DuplicateBlockException,
  BlockNotFoundException,
  SelfActionException,
} from '../errors/social.errors';
import { RedisKeyBuilder } from '../../../common/constants/redis-keys.constant'; // [UPDATED]
import socialConfig from 'src/config/social.config';
import type { ConfigType } from '@nestjs/config';
import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';
import { CursorPaginatedResult } from 'src/common/interfaces/paginated-result.interface';
@Injectable()
export class BlockService {
  private readonly logger = new Logger(BlockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(socialConfig.KEY)
    private readonly config: ConfigType<typeof socialConfig>,
  ) {}

  /**
   * Block a user
   *
   * Cascade operations:
   * 1. Delete all Friendship records (any status)
   * 2. Delete PENDING GroupJoinRequest records
   * 3. Keep APPROVED/REJECTED GroupJoinRequest (audit log)
   * 4. Invalidate all related cache
   * 5. Publish block event
   */
  async blockUser(
    blockerId: string,
    dto: BlockUserDto,
  ): Promise<BlockResponseDto> {
    const { blockedUserId, reason } = dto;

    // Validation 1: Cannot block self
    if (blockerId === blockedUserId) {
      throw new SelfActionException('Cannot block yourself');
    }

    // Validation 2: Check if already blocked
    const existingBlock = await this.findBlock(blockerId, blockedUserId);
    if (existingBlock) {
      throw new DuplicateBlockException('User is already blocked');
    }

    // Execute block transaction with cascade operations
    const block = await this.executeBlockTransaction(
      blockerId,
      blockedUserId,
      reason,
    );

    // Invalidate cache
    await this.invalidateBlockCache(blockerId, blockedUserId);

    // Publish event for real-time updates
    this.eventEmitter.emit('user.blocked', {
      blockerId,
      blockedId: blockedUserId,
      blockId: block.id,
    });

    this.logger.log(`User blocked: ${blockerId} blocked ${blockedUserId}`);

    return this.mapToResponseDto(block);
  }

  /**
   * Unblock a user
   */
  async unblockUser(blockerId: string, blockedUserId: string): Promise<void> {
    // Validation: Cannot unblock self
    if (blockerId === blockedUserId) {
      throw new SelfActionException('Cannot unblock yourself');
    }

    // Find block record
    const block = await this.findBlock(blockerId, blockedUserId);
    if (!block) {
      throw new BlockNotFoundException('Block record not found');
    }

    // Delete block record
    await this.prisma.block.delete({
      where: { id: block.id },
    });

    // Invalidate cache
    await this.invalidateBlockCache(blockerId, blockedUserId);

    // Publish event
    this.eventEmitter.emit('user.unblocked', {
      blockerId,
      blockedId: blockedUserId,
      blockId: block.id,
    });

    this.logger.log(`User unblocked: ${blockerId} unblocked ${blockedUserId}`);
  }

  /**
   * Check if user1 has blocked user2 (or vice versa)
   *
   * Uses cache-aside pattern with short TTL
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

  async getBlockedList(
    blockerId: string,
    query: CursorPaginationDto,
  ): Promise<CursorPaginatedResult<BlockedUserDto>> {
    const { cursor, limit = 20 } = query;

    // 1. Query Database
    const blocks = await this.prisma.block.findMany({
      where: { blockerId },
      // Lấy thừa 1 bản ghi để xác định hasNextPage
      take: limit + 1,
      // Logic Cursor chuẩn
      cursor: cursor ? { id: cursor } : undefined,
      // skip: cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' }, //  Bảng Block có createdAt
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

    // 2. Tính toán Cursor
    const hasNextPage = blocks.length > limit;
    const data = hasNextPage ? blocks.slice(0, -1) : blocks;
    const nextCursor = hasNextPage ? data[data.length - 1].id : undefined;

    // 3. Map to DTO
    const mappedData: BlockedUserDto[] = data.map((block) => ({
      blockId: block.id,
      userId: block.blocked.id,
      displayName: block.blocked.displayName,
      avatarUrl: block.blocked.avatarUrl ?? undefined,
      blockedAt: block.createdAt,
      reason: block.reason ?? undefined,
    }));

    // 4. Return Result
    return {
      data: mappedData,
      meta: {
        limit,
        hasNextPage,
        nextCursor,
        // total: undefined, // Không count(*) để tối ưu hiệu năng cho list này
      },
    };
  }

  /**
   * Get list of users who blocked current user (reverse lookup)
   */
  async getBlockedByUsers(userId: string): Promise<string[]> {
    const blocks = await this.prisma.block.findMany({
      where: { blockedId: userId },
      select: { blockerId: true },
    });

    return blocks.map((block) => block.blockerId);
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Find block record between two users
   */
  private async findBlock(
    blockerId: string,
    blockedId: string,
  ): Promise<Block | null> {
    return this.prisma.block.findFirst({
      where: {
        blockerId,
        blockedId,
      },
    });
  }

  /**
   * Execute block transaction with cascade operations
   *
   * CRITICAL: All operations must succeed or all must fail (ACID)
   */
  private async executeBlockTransaction(
    blockerId: string,
    blockedId: string,
    reason?: string,
  ): Promise<Block> {
    return this.prisma.$transaction(
      async (tx) => {
        // 1. Insert block record
        const block = await tx.block.create({
          data: {
            blockerId,
            blockedId,
            reason,
          },
        });

        // 2. Delete ALL friendship records (any status)
        const [user1Id, user2Id] = this.sortUserIds(blockerId, blockedId);
        await tx.friendship.deleteMany({
          where: {
            user1Id,
            user2Id,
          },
        });

        // 3. Delete PENDING GroupJoinRequest records
        await tx.groupJoinRequest.deleteMany({
          where: {
            OR: [
              // Blocker invited Blocked
              {
                userId: blockedId,
                inviterId: blockerId,
                status: JoinRequestStatus.PENDING,
              },
              // Blocked invited Blocker
              {
                userId: blockerId,
                inviterId: blockedId,
                status: JoinRequestStatus.PENDING,
              },
            ],
          },
        });

        this.logger.debug(
          `Block transaction completed for ${blockerId} → ${blockedId}`,
        );

        return block;
      },
      {
        timeout: 10000, // ← Add timeout for safety
      },
    );
  }

  /**
   * Invalidate all cache related to block
   */
  private async invalidateBlockCache(
    userId1: string,
    userId2: string,
  ): Promise<void> {
    const keys = [
      RedisKeyBuilder.socialBlock(userId1, userId2),
      // Also invalidate permission caches
      RedisKeyBuilder.socialPermission('message', userId1, userId2),
      RedisKeyBuilder.socialPermission('message', userId2, userId1),
      RedisKeyBuilder.socialPermission('call', userId1, userId2),
      RedisKeyBuilder.socialPermission('call', userId2, userId1),
      // Invalidate friendship cache
      RedisKeyBuilder.socialFriendship(userId1, userId2),
      RedisKeyBuilder.socialFriendCount(userId1, 'ACCEPTED'),
      RedisKeyBuilder.socialFriendCount(userId2, 'ACCEPTED'),
    ];

    await this.redis.del(...keys);

    // Publish cache invalidation event for multi-node sync
    this.eventEmitter.emit('cache.invalidate', {
      keys,
      reason: 'block_changed',
    });

    this.logger.debug(
      `Block cache invalidated for users: ${userId1}, ${userId2}`,
    );
  }

  /**
   * Get cache key for block check
   */
  private getBlockCacheKey(userId1: string, userId2: string): string {
    // Order doesn't matter for block (it's bidirectional in effect)
    const [user1, user2] = this.sortUserIds(userId1, userId2);
    return `block:${user1}:${user2}`;
  }

  /**
   * Sort user IDs for consistent cache keys
   */
  private sortUserIds(userId1: string, userId2: string): [string, string] {
    return userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
  }

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
