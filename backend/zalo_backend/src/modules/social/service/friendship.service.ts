/**
 * FriendshipService - Core service for managing friend relationships
 *
 * Responsibilities:
 * - Send, accept, decline, cancel friend requests
 * - Unfriend users
 * - Query friendships (list, check status, mutual friends)
 * - Enforce business rules (rate limits, privacy, blocks)
 * - Manage cache invalidation
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RedisService } from 'src/modules/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Friendship, FriendshipStatus, Prisma } from '@prisma/client';
import {
  GetFriendsQueryDto,
  FriendshipResponseDto,
  FriendWithUserDto,
  MutualFriendsDto,
} from '../dto/friendship.dto';
import {
  BlockedException,
  DuplicateRequestException,
  FriendshipNotFoundException,
  InvalidFriendshipStateException,
  SelfActionException,
  DeclineCooldownException,
  FriendRequestLimitException,
} from '../errors/social.errors';
import { BlockService } from './block.service';
import { PrivacyService } from './privacy.service';
import { RedisKeyBuilder } from 'src/common/constants/redis-keys.constant';
import socialConfig from 'src/config/social.config';
import type { ConfigType } from '@nestjs/config';
import { CursorPaginatedResult } from 'src/common/interfaces/paginated-result.interface';

@Injectable()
export class FriendshipService {
  private readonly logger = new Logger(FriendshipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly blockService: BlockService, // [UPDATED] Inject thật
    private readonly privacyService: PrivacyService,
    @Inject(socialConfig.KEY)
    private readonly config: ConfigType<typeof socialConfig>,
  ) {}

  /**
   * Send a friend request
   *
   * Validations:
   * 1. Not blocking self
   * 2. Not blocked by either party
   * 3. Check privacy settings
   * 4. Check rate limits
   * 5. Check duplicate requests
   * 6. Check cooldown periods
   */
  async sendFriendRequest(
    requesterId: string,
    targetUserId: string,
  ): Promise<FriendshipResponseDto> {
    // Validation 1: Cannot send request to self
    if (requesterId === targetUserId) {
      throw new SelfActionException('Cannot send friend request to yourself');
    }

    // Validation 2: Check if either user is blocked
    await this.validateNotBlocked(requesterId, targetUserId);

    // Validation 3: Check privacy settings
    // await this.validatePrivacySettings(requesterId, targetUserId);

    // Validation 4: Check rate limits
    await this.validateRateLimits(requesterId);

    // Validation 5: Check for existing friendship
    const existingFriendship = await this.findFriendship(
      requesterId,
      targetUserId,
    );
    if (existingFriendship) {
      // Nếu đã có quan hệ, tùy status mà báo lỗi hoặc xử lý
      if (existingFriendship.status === FriendshipStatus.ACCEPTED) {
        throw new DuplicateRequestException('You are already friends');
      }
      if (existingFriendship.status === FriendshipStatus.PENDING) {
        throw new DuplicateRequestException('Friend request already pending');
      }
    }

    // Validation 6: Check cooldown periods
    await this.validateCooldowns(requesterId, targetUserId);

    // All validations passed - create friendship
    const friendship = await this.createFriendship(requesterId, targetUserId);

    // Increment rate limit counters
    await this.incrementRateLimitCounters(requesterId);

    // Publish event
    this.eventEmitter.emit('friendship.request.sent', {
      requesterId,
      targetUserId,
      friendshipId: friendship.id,
    });

    this.logger.log(`Friend request sent: ${requesterId} → ${targetUserId}`);

    return this.mapToResponseDto(friendship);
  }

  /**
   * Accept a friend request
   *
   * Validations:
   * 1. Friendship exists and is PENDING
   * 2. Current user is the recipient (not requester)
   * 3. Not blocked
   */
  async acceptRequest(
    userId: string,
    friendshipId: string,
  ): Promise<FriendshipResponseDto> {
    // Find friendship
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new FriendshipNotFoundException();
    }

    // Validation 1: Must be PENDING
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new InvalidFriendshipStateException(
        `Cannot accept friendship with status: ${friendship.status}`,
      );
    }

    // Validation 2: Current user must be the recipient (not requester)
    const isRecipient =
      (friendship.user1Id === userId && friendship.requesterId !== userId) ||
      (friendship.user2Id === userId && friendship.requesterId !== userId);

    if (!isRecipient) {
      throw new InvalidFriendshipStateException(
        'Only the recipient can accept friend request',
      );
    }

    // Validation 3: Check not blocked
    await this.validateNotBlocked(friendship.user1Id, friendship.user2Id);

    // Update friendship to ACCEPTED
    const updatedFriendship = await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: {
        status: FriendshipStatus.ACCEPTED,
        acceptedAt: new Date(),
        lastActionAt: new Date(),
        lastActionBy: userId,
      },
    });

    // Invalidate cache
    await this.invalidateFriendshipCache(
      friendship.user1Id,
      friendship.user2Id,
    );

    // Publish event
    this.eventEmitter.emit('friendship.accepted', {
      friendshipId,
      acceptedBy: userId,
      requesterId: friendship.requesterId,
    });

    this.logger.log(`Friend request accepted: ${friendshipId} by ${userId}`);

    return this.mapToResponseDto(updatedFriendship);
  }

  /**
   * Decline a friend request
   */
  async declineRequest(userId: string, friendshipId: string): Promise<void> {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new FriendshipNotFoundException();
    }

    // Validation: Must be PENDING
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new InvalidFriendshipStateException(
        `Cannot decline friendship with status: ${friendship.status}`,
      );
    }

    // Validation: Must be recipient
    const isRecipient =
      (friendship.user1Id === userId && friendship.requesterId !== userId) ||
      (friendship.user2Id === userId && friendship.requesterId !== userId);

    if (!isRecipient) {
      throw new InvalidFriendshipStateException(
        'Only the recipient can decline friend request',
      );
    }

    // Update to DECLINED
    await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: {
        status: FriendshipStatus.DECLINED,
        declinedAt: new Date(),
        lastActionAt: new Date(),
        lastActionBy: userId,
        expiresAt: this.calculateExpiryDate(
          this.config.cooldowns.requestExpiryDays,
        ), // Expire after 90 days
      },
    });

    // Invalidate cache
    await this.invalidateFriendshipCache(
      friendship.user1Id,
      friendship.user2Id,
    );

    // Publish event
    this.eventEmitter.emit('friendship.declined', {
      friendshipId,
      declinedBy: userId,
      requesterId: friendship.requesterId,
    });

    this.logger.log(`Friend request declined: ${friendshipId} by ${userId}`);
  }

  /**
   * Cancel a friend request (by requester)
   */
  async cancelRequest(userId: string, friendshipId: string): Promise<void> {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new FriendshipNotFoundException();
    }

    // Validation: Must be PENDING
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new InvalidFriendshipStateException(
        `Cannot cancel friendship with status: ${friendship.status}`,
      );
    }

    // Validation: Must be requester
    if (friendship.requesterId !== userId) {
      throw new InvalidFriendshipStateException(
        'Only the requester can cancel friend request',
      );
    }

    // Delete the friendship
    await this.prisma.friendship.delete({
      where: { id: friendshipId },
    });

    // Invalidate cache
    await this.invalidateFriendshipCache(
      friendship.user1Id,
      friendship.user2Id,
    );

    // Publish event
    this.eventEmitter.emit('friendship.cancelled', {
      friendshipId,
      cancelledBy: userId,
    });

    this.logger.log(`Friend request cancelled: ${friendshipId} by ${userId}`);
  }

  /**
   * Unfriend a user
   */
  async removeFriendship(userId: string, targetUserId: string): Promise<void> {
    if (userId === targetUserId) {
      throw new SelfActionException('Cannot unfriend yourself');
    }

    // Find friendship
    const friendship = await this.findFriendship(userId, targetUserId);

    if (!friendship) {
      throw new FriendshipNotFoundException();
    }

    // Validation: Must be ACCEPTED
    if (friendship.status !== FriendshipStatus.ACCEPTED) {
      throw new InvalidFriendshipStateException(
        'Can only unfriend users with ACCEPTED friendship',
      );
    }

    // Delete friendship
    await this.prisma.friendship.delete({
      where: { id: friendship.id },
    });

    // Invalidate cache
    await this.invalidateFriendshipCache(userId, targetUserId);

    // Publish event
    this.eventEmitter.emit('friendship.removed', {
      friendshipId: friendship.id,
      removedBy: userId,
      user1Id: friendship.user1Id,
      user2Id: friendship.user2Id,
    });

    this.logger.log(`Unfriend: ${userId} removed ${targetUserId}`);
  }

  /**
   * Check if two users are friends
   */
  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    // Try cache first
    const cacheKey = this.getFriendshipCacheKey(userId1, userId2);
    const cached = await this.redis.get(cacheKey);

    if (cached !== null) {
      return cached === '1';
    }

    // Query database
    const friendship = await this.findFriendship(userId1, userId2);
    const areFriends = friendship?.status === FriendshipStatus.ACCEPTED;

    // Cache result
    await this.redis.setex(
      cacheKey,
      this.config.ttl.friendship,
      areFriends ? '1' : '0',
    );

    return areFriends;
  }

  /**
   * Get paginated friend list (not search)
   */
  async getFriendsList(
    userId: string,
    query: GetFriendsQueryDto,
  ): Promise<CursorPaginatedResult<FriendWithUserDto>> {
    // [Return Type Chuẩn]
    const {
      cursor,
      limit = 20,
      status = FriendshipStatus.ACCEPTED,
      search,
    } = query;

    // 1. Xây dựng điều kiện Search (Nếu có)
    // Tìm trong User1 hoặc User2 (đối phương) dựa trên DisplayName hoặc Phone
    let searchCondition: Prisma.FriendshipWhereInput | undefined;

    if (search) {
      searchCondition = {
        OR: [
          // Case A: Mình là User1 -> Tìm User2 (Đối phương) khớp tên/sđt
          {
            user1Id: userId,
            user2: {
              OR: [
                { displayName: { contains: search, mode: 'insensitive' } },
                { phoneNumber: { contains: search } },
              ],
            },
          },
          // Case B: Mình là User2 -> Tìm User1 (Đối phương) khớp tên/sđt
          {
            user2Id: userId,
            user1: {
              OR: [
                { displayName: { contains: search, mode: 'insensitive' } },
                { phoneNumber: { contains: search } },
              ],
            },
          },
        ],
      };
    }

    // 2. Tổng hợp Where Clause
    // Logic: (Liên quan đến tôi) AND (Đúng Status) AND (Search khớp nếu có) AND (Chưa xóa)
    const where: Prisma.FriendshipWhereInput = {
      status,
      deletedAt: null,
      AND: [
        // Điều kiện 1: Phải là bản ghi của tôi (Tôi là user1 hoặc user2)
        // Nếu không có search, ta dùng OR đơn giản.
        // Nếu có search, logic searchCondition ở trên đã bao hàm việc check user1Id/user2Id rồi.
        searchCondition
          ? searchCondition
          : { OR: [{ user1Id: userId }, { user2Id: userId }] },
      ],
    };

    // 3. Thực thi Query Prisma
    const friendships = await this.prisma.friendship.findMany({
      where,
      take: limit + 1, // Lấy dư 1 để check next page
      cursor: cursor ? { id: cursor } : undefined,
      // skip: cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' }, // Bạn mới kết bạn lên đầu
      include: {
        // Chỉ select các field cần thiết để tối ưu performance
        user1: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            phoneNumber: true,
          },
        },
        user2: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            phoneNumber: true,
          },
        },
      },
    });

    // 4. Pagination Logic
    const hasNextPage = friendships.length > limit;
    const data = hasNextPage ? friendships.slice(0, -1) : friendships;
    const nextCursor = hasNextPage ? data[data.length - 1].id : undefined;

    // 5. Map Response
    const mappedFriends: FriendWithUserDto[] = data.map((friendship) => {
      // Xác định ai là bạn, ai là mình
      const friend =
        friendship.user1Id === userId ? friendship.user2 : friendship.user1;

      return {
        friendshipId: friendship.id,
        userId: friend.id,
        displayName: friend.displayName, // Lưu ý: Ở đây chưa xử lý Alias (để MVP đơn giản)
        avatarUrl: friend.avatarUrl ?? undefined,
        status: friendship.status,
        createdAt: friendship.createdAt,
        acceptedAt: friendship.acceptedAt ?? undefined,
      };
    });

    // 6. Return Result
    return {
      data: mappedFriends,
      meta: {
        limit,
        hasNextPage,
        nextCursor,
        // total: undefined, // Bỏ total count khi search/scroll để tối ưu DB
      },
    };
  }

  /**
   * Get pending friend requests (received)
   */
  async getReceivedRequests(userId: string): Promise<FriendshipResponseDto[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { user1Id: userId, requesterId: { not: userId } },
          { user2Id: userId, requesterId: { not: userId } },
        ],
        status: FriendshipStatus.PENDING,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return friendships.map((friendship) => this.mapToResponseDto(friendship));
  }

  /**
   * Get sent friend requests
   */
  async getSentRequests(userId: string): Promise<FriendshipResponseDto[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        requesterId: userId,
        status: FriendshipStatus.PENDING,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return friendships.map((friendship) => this.mapToResponseDto(friendship));
  }

  /**
   * Get mutual friends between two users
   */
  async getMutualFriends(
    userId: string,
    otherUserId: string,
  ): Promise<MutualFriendsDto[]> {
    // Get friends of userId
    const userFriends = await this.getFriendIds(userId);

    // Get friends of otherUserId
    const otherUserFriends = await this.getFriendIds(otherUserId);

    // Find intersection
    const mutualFriendIds = userFriends.filter((id) =>
      otherUserFriends.includes(id),
    );

    if (mutualFriendIds.length === 0) {
      return [];
    }

    // Fetch user details
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: mutualFriendIds },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    return users.map((user) => ({
      userId: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl ?? undefined,
    }));
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Find friendship between two users (canonical ordering)
   */
  private async findFriendship(
    userId1: string,
    userId2: string,
  ): Promise<Friendship | null> {
    const [user1Id, user2Id] = this.sortUserIds(userId1, userId2);

    return this.prisma.friendship.findFirst({
      where: {
        user1Id,
        user2Id,
        deletedAt: null,
      },
    });
  }

  /**
   * Create friendship with canonical ordering
   */
  private async createFriendship(
    requesterId: string,
    targetId: string,
  ): Promise<Friendship> {
    const [user1Id, user2Id] = this.sortUserIds(requesterId, targetId);

    return this.prisma.friendship.create({
      data: {
        user1Id,
        user2Id,
        requesterId,
        status: FriendshipStatus.PENDING,
        lastActionAt: new Date(),
        lastActionBy: requesterId,
        expiresAt: this.calculateExpiryDate(
          this.config.cooldowns.requestExpiryDays,
        ),
      },
    });
  }

  /**
   * Sort user IDs for canonical ordering (user1Id < user2Id)
   */
  private sortUserIds(userId1: string, userId2: string): [string, string] {
    return userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
  }

  /**
   * Validate that neither user is blocked
   */
  private async validateNotBlocked(
    userId1: string,
    userId2: string,
  ): Promise<void> {
    const isBlocked = await this.blockService.isBlocked(userId1, userId2);
    if (isBlocked) {
      throw new BlockedException('Cannot interact with blocked user');
    }
  }

  /**
   * Validate rate limits
   */
  private async validateRateLimits(userId: string): Promise<void> {
    const dailyKey = RedisKeyBuilder.rateLimitFriendRequest(userId, 'daily');
    const weeklyKey = RedisKeyBuilder.rateLimitFriendRequest(userId, 'weekly');

    const [dailyCount, weeklyCount] = await Promise.all([
      this.redis.get(dailyKey),
      this.redis.get(weeklyKey),
    ]);

    const dailyLimit = this.config.limits.friendRequest.daily;
    const weeklyLimit = this.config.limits.friendRequest.weekly;

    if (dailyCount && parseInt(dailyCount) >= dailyLimit) {
      throw new FriendRequestLimitException(dailyLimit, 'day', 86400);
    }

    if (weeklyCount && parseInt(weeklyCount) >= weeklyLimit) {
      throw new FriendRequestLimitException(weeklyLimit, 'week', 604800);
    }
  }

  private async incrementRateLimitCounters(userId: string): Promise<void> {
    const dailyKey = RedisKeyBuilder.rateLimitFriendRequest(userId, 'daily');
    const weeklyKey = RedisKeyBuilder.rateLimitFriendRequest(userId, 'weekly');

    const pipeline = this.redis.getClient().pipeline();
    pipeline.incr(dailyKey);
    pipeline.expire(dailyKey, 86400); // 24h
    pipeline.incr(weeklyKey);
    pipeline.expire(weeklyKey, 604800); // 7d
    await pipeline.exec();
  }

  /**
   * Validate cooldown periods
   */
  private async validateCooldowns(
    requesterId: string,
    targetId: string,
  ): Promise<void> {
    // Check decline cooldown
    const lastDeclined = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { user1Id: requesterId, user2Id: targetId },
          { user1Id: targetId, user2Id: requesterId },
        ],
        status: FriendshipStatus.DECLINED,
        lastActionBy: targetId, // Target declined the request
      },
      orderBy: { lastActionAt: 'desc' },
    });

    if (lastDeclined && lastDeclined.lastActionAt) {
      const hoursSinceDecline =
        (Date.now() - lastDeclined.lastActionAt.getTime()) / (1000 * 60 * 60);

      const cooldownHours = this.config.cooldowns.declineHours;
      if (hoursSinceDecline < cooldownHours) {
        throw new DeclineCooldownException(cooldownHours);
      }
    }

    // Check unblock cooldown
    // This requires BlockService integration
    // Placeholder for now
  }

  /**
   * Get friend IDs for a user
   */
  private async getFriendIds(userId: string): Promise<string[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
        status: FriendshipStatus.ACCEPTED,
        deletedAt: null,
      },
      select: {
        user1Id: true,
        user2Id: true,
      },
    });

    return friendships.map((f) =>
      f.user1Id === userId ? f.user2Id : f.user1Id,
    );
  }

  /**
   * Get friend count (cached)
   */
  private async getFriendCount(
    userId: string,
    status: FriendshipStatus = FriendshipStatus.ACCEPTED,
  ): Promise<number> {
    const cacheKey = RedisKeyBuilder.socialFriendCount(userId, status);
    const cached = await this.redis.get(cacheKey);

    if (cached !== null) return parseInt(cached);

    const count = await this.prisma.friendship.count({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
        status,
        deletedAt: null, // Soft delete check
      },
    });

    await this.redis.setex(
      cacheKey,
      this.config.ttl.friendList,
      count.toString(),
    );
    return count;
  }

  /**
   * Invalidate friendship cache
   */
  private async invalidateFriendshipCache(
    userId1: string,
    userId2: string,
  ): Promise<void> {
    const keys = [
      RedisKeyBuilder.socialFriendship(userId1, userId2),
      RedisKeyBuilder.socialFriendCount(userId1),
      RedisKeyBuilder.socialFriendCount(userId2),
      // Invalidate permission caches vì quan hệ bạn bè ảnh hưởng quyền nhắn tin/gọi
      RedisKeyBuilder.socialPermission('message', userId1, userId2),
      RedisKeyBuilder.socialPermission('message', userId2, userId1),
      RedisKeyBuilder.socialPermission('call', userId1, userId2),
      RedisKeyBuilder.socialPermission('call', userId2, userId1),
    ];

    // Delete keys
    await this.redis.del(...keys);
    this.logger.debug(
      `Friendship cache invalidated for ${userId1}, ${userId2}`,
    );
  }
  /**
   * Get cache key for friendship check
   */
  private getFriendshipCacheKey(userId1: string, userId2: string): string {
    return RedisKeyBuilder.socialFriendship(userId1, userId2);
  }

  /**
   * Calculate expiry date
   */
  private calculateExpiryDate(days: number): Date {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    return expiryDate;
  }

  /**
   * Map Friendship entity to response DTO
   */
  private mapToResponseDto(friendship: Friendship): FriendshipResponseDto {
    return {
      id: friendship.id,
      user1Id: friendship.user1Id,
      user2Id: friendship.user2Id,
      requesterId: friendship.requesterId,
      status: friendship.status,
      createdAt: friendship.createdAt,
      acceptedAt: friendship.acceptedAt ?? undefined,
      declinedAt: friendship.declinedAt ?? undefined,
      expiresAt: friendship.expiresAt ?? undefined,
    };
  }
}
