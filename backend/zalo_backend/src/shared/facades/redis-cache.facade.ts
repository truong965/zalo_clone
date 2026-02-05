import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@modules/redis/redis.service';
import Redis from 'ioredis';

/**
 * @deprecated Since 2026-02-04. Use RedisKeyBuilder from src/shared/redis/redis-key-builder.ts
 * directly with RedisService. Will be removed in Phase 5 (Friendship refactor).
 *
 * R1: Redis Cache Facade
 *
 * Provides dependency injection pattern for Redis cache operations.
 * Abstracts direct Redis client access behind a facade interface.
 *
 * Benefits:
 * - Consistent cache key naming conventions
 * - Typed methods for cache operations
 * - Centralized cache invalidation logic
 * - Easy to test (can mock facade)
 * - Reduces direct imports of RedisService in listeners
 *
 * Usage Pattern (instead of direct imports):
 * ```typescript
 * // ❌ AVOID: Direct import
 * this.redis.getClient().del('key')
 *
 * // ✅ PREFER: Through facade
 * await this.cacheService.invalidateKey('friend_requests:pending:userId')
 * ```
 */
@Injectable()
export class RedisCacheFacade {
  private readonly logger = new Logger(RedisCacheFacade.name);
  private readonly client: Redis;

  /**
   * Cache key prefixes for different domains
   * Ensures consistent naming across application
   */
  private readonly CACHE_PREFIXES = {
    FRIENDSHIP: 'friendship',
    FRIENDS_LIST: 'friends',
    FRIEND_REQUESTS: 'friend_requests',
    PENDING_REQUESTS: 'friend_requests:pending',
    BLOCKED_USERS: 'blocked_users',
    BLOCK_LIST: 'block_list',
    CALL_HISTORY: 'call_history',
    CONVERSATIONS: 'conversations',
    CONVERSATION_MESSAGES: 'conversation_messages',
    NOTIFICATIONS: 'notifications',
    USER_PRESENCE: 'user_presence',
    USER_PROFILE: 'user_profile',
    SOCKET_CONNECTIONS: 'socket_connections',
  } as const;

  constructor(private readonly redisService: RedisService) {
    this.client = this.redisService.getClient();
  }

  /**
   * Invalidate a single cache key
   *
   * @param key - Cache key to invalidate
   * @example
   * await this.cache.invalidateKey('friends:user-123')
   */
  async invalidateKey(key: string): Promise<void> {
    try {
      const result = await this.client.del(key);
      this.logger.debug(`[CACHE] Invalidated key: ${key} (removed: ${result})`);
    } catch (error) {
      this.logger.error(`[CACHE] Failed to invalidate key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Invalidate multiple cache keys atomically
   *
   * @param keys - Array of cache keys to invalidate
   * @example
   * await this.cache.invalidateKeys(['friends:user-123', 'friend_requests:user-123'])
   */
  async invalidateKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    try {
      const result = await this.client.del(...keys);
      this.logger.debug(
        `[CACHE] Invalidated ${keys.length} keys (removed: ${result})`,
      );
    } catch (error) {
      this.logger.error(`[CACHE] Failed to invalidate keys:`, error);
      throw error;
    }
  }

  /**
   * Invalidate all keys matching a pattern
   *
   * @param pattern - Redis key pattern (e.g., 'friends:*', 'friend_requests:pending:user-123:*')
   * @example
   * await this.cache.invalidatePattern('friends:user-123:*')
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.invalidateKeys(keys);
        this.logger.debug(
          `[CACHE] Invalidated ${keys.length} keys matching pattern: ${pattern}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[CACHE] Failed to invalidate pattern ${pattern}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Invalidate user's friend list cache
   *
   * @param userId - User ID
   * @example
   * await this.cache.invalidateFriendsList(userId)
   */
  async invalidateFriendsList(userId: string): Promise<void> {
    const key = `${this.CACHE_PREFIXES.FRIENDS_LIST}:${userId}`;
    await this.invalidateKey(key);
  }

  /**
   * Invalidate user's pending friend requests cache
   *
   * @param userId - User ID
   * @example
   * await this.cache.invalidatePendingRequests(userId)
   */
  async invalidatePendingRequests(userId: string): Promise<void> {
    const key = `${this.CACHE_PREFIXES.PENDING_REQUESTS}:${userId}`;
    await this.invalidateKey(key);
  }

  /**
   * Invalidate friendship-related caches for two users
   *
   * @param user1Id - First user ID
   * @param user2Id - Second user ID
   * @example
   * await this.cache.invalidateFriendshipCaches(user1Id, user2Id)
   */
  async invalidateFriendshipCaches(
    user1Id: string,
    user2Id: string,
  ): Promise<void> {
    const keys = [
      `${this.CACHE_PREFIXES.FRIENDS_LIST}:${user1Id}`,
      `${this.CACHE_PREFIXES.FRIENDS_LIST}:${user2Id}`,
      `${this.CACHE_PREFIXES.PENDING_REQUESTS}:${user1Id}`,
      `${this.CACHE_PREFIXES.PENDING_REQUESTS}:${user2Id}`,
    ];
    await this.invalidateKeys(keys);
  }

  /**
   * Invalidate block-related caches
   *
   * @param blockerId - User ID of blocker
   * @param blockedId - User ID of blocked user
   * @example
   * await this.cache.invalidateBlockCaches(blockerId, blockedId)
   */
  async invalidateBlockCaches(
    blockerId: string,
    blockedId: string,
  ): Promise<void> {
    const keys = [
      `${this.CACHE_PREFIXES.BLOCK_LIST}:${blockerId}`,
      `${this.CACHE_PREFIXES.BLOCKED_USERS}:${blockedId}`,
      `${this.CACHE_PREFIXES.USER_PROFILE}:${blockedId}`,
    ];
    await this.invalidateKeys(keys);
  }

  /**
   * Invalidate conversation-related caches
   *
   * @param conversationId - Conversation ID
   * @example
   * await this.cache.invalidateConversationCache(conversationId)
   */
  async invalidateConversationCache(conversationId: string): Promise<void> {
    const keys = [
      `${this.CACHE_PREFIXES.CONVERSATIONS}:${conversationId}`,
      `${this.CACHE_PREFIXES.CONVERSATION_MESSAGES}:${conversationId}:*`,
    ];
    await this.invalidatePattern(keys[1]);
    await this.invalidateKey(keys[0]);
  }

  /**
   * Invalidate call history cache for multiple users
   *
   * @param userIds - Array of user IDs
   * @example
   * await this.cache.invalidateCallHistories([user1Id, user2Id])
   */
  async invalidateCallHistories(userIds: string[]): Promise<void> {
    const keys = userIds.map(
      (id) => `${this.CACHE_PREFIXES.CALL_HISTORY}:${id}`,
    );
    await this.invalidateKeys(keys);
  }

  /**
   * Invalidate user profile cache
   *
   * @param userId - User ID
   * @example
   * await this.cache.invalidateUserProfile(userId)
   */
  async invalidateUserProfile(userId: string): Promise<void> {
    const key = `${this.CACHE_PREFIXES.USER_PROFILE}:${userId}`;
    await this.invalidateKey(key);
  }

  /**
   * Invalidate user presence cache
   *
   * @param userId - User ID
   * @example
   * await this.cache.invalidateUserPresence(userId)
   */
  async invalidateUserPresence(userId: string): Promise<void> {
    const key = `${this.CACHE_PREFIXES.USER_PRESENCE}:${userId}`;
    await this.invalidateKey(key);
  }

  /**
   * Get raw Redis client for advanced operations
   *
   * Use this only when facade doesn't have the operation you need.
   * Avoid using directly in business logic (breaks abstraction).
   *
   * @returns Redis client
   * @deprecated Prefer using facade methods instead
   */
  getClient(): Redis {
    this.logger.warn(
      '[CACHE] Raw Redis client accessed. Prefer facade methods instead.',
    );
    return this.client;
  }

  /**
   * Check if cache is connected
   *
   * @returns true if Redis is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get cache statistics
   *
   * @returns Cache info including memory usage, keys count, etc.
   */
  async getStats(): Promise<Record<string, any>> {
    try {
      const info = await this.client.info('stats');
      return { status: 'connected', info };
    } catch (error) {
      return { status: 'disconnected', error: error.message };
    }
  }
}
