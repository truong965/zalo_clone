/**
 * Friendship Cache Invalidation Helper
 *
 * Centralizes cache key logic for friendship-related invalidations.
 * Uses RedisKeyBuilder as single source of truth.
 */

import { RedisService } from '@modules/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';

export class FriendshipCacheHelper {
  /**
   * Invalidate all friendship caches for two users
   */
  static async invalidateForUsers(
    redis: RedisService,
    userId1: string,
    userId2: string,
  ): Promise<void> {
    const keys = [
      RedisKeyBuilder.socialFriendship(userId1, userId2),
      RedisKeyBuilder.friendshipStatus(userId1, userId2),
      RedisKeyBuilder.friendshipFriendsList(userId1),
      RedisKeyBuilder.friendshipFriendsList(userId2),
      RedisKeyBuilder.friendshipPendingRequests(userId1),
      RedisKeyBuilder.friendshipPendingRequests(userId2),
      RedisKeyBuilder.friendshipSentRequests(userId1),
      RedisKeyBuilder.friendshipSentRequests(userId2),
      RedisKeyBuilder.socialPermission('message', userId1, userId2),
      RedisKeyBuilder.socialPermission('message', userId2, userId1),
      RedisKeyBuilder.socialPermission('call', userId1, userId2),
      RedisKeyBuilder.socialPermission('call', userId2, userId1),
      RedisKeyBuilder.socialPermission('profile', userId1, userId2),
      RedisKeyBuilder.socialPermission('profile', userId2, userId1),
    ];

    await redis.del(...keys);
    await redis.deletePattern(
      RedisKeyBuilder.socialFriendCountPattern(userId1),
    );
    await redis.deletePattern(
      RedisKeyBuilder.socialFriendCountPattern(userId2),
    );
  }

  /**
   * Invalidate pending/sent requests cache for a user
   */
  static async invalidatePendingForUser(
    redis: RedisService,
    userId: string,
  ): Promise<void> {
    const keys = [
      RedisKeyBuilder.friendshipPendingRequests(userId),
      RedisKeyBuilder.friendshipSentRequests(userId),
    ];
    await redis.del(...keys);
  }

  /**
   * Invalidate call history cache for users (e.g. after unfriend)
   */
  static async invalidateCallHistories(
    redis: RedisService,
    userIds: string[],
  ): Promise<void> {
    if (userIds.length === 0) return;
    const keys = userIds.map((id) => RedisKeyBuilder.callHistory(id));
    await redis.del(...keys);
  }
}
