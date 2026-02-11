import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@modules/redis/redis.service';

/**
 * Search Cache Service (Phase B: TD-09 — Redis-based cache)
 *
 * BEFORE: Used NestJS in-memory CacheModule with broken `store.keys()` pattern deletion.
 * AFTER: Uses RedisService directly with SCAN-based pattern deletion.
 *
 * Benefits:
 * - Works with Redis cluster (SCAN instead of KEYS)
 * - Shared cache across multiple app instances
 * - Proper TTL management
 * - Pattern-based invalidation via `deletePattern()` using scanStream
 *
 * Cache key convention: `search:{type}:{scope}:{params}`
 * Examples:
 *   search:messages:{conversationId}:{keyword}:{cursor}
 *   search:contacts:{userId}:{keyword}
 *   search:global:{userId}:{keyword}
 */
@Injectable()
export class SearchCacheService {
  private readonly logger = new Logger(SearchCacheService.name);
  private readonly enableCache: boolean;
  private readonly keyPrefix = 'search:';

  constructor(
    @Optional() private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.enableCache =
      configService.get('SEARCH_CACHE_ENABLED', 'true') === 'true';

    if (this.enableCache && !this.redis) {
      this.logger.warn(
        'SearchCacheService: SEARCH_CACHE_ENABLED=true but RedisService not available. Cache disabled.',
      );
      this.enableCache = false;
    }
  }

  /**
   * Get value from Redis cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.enableCache) return null;

    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(
        `Cache get error for key ${key}: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      return null;
    }
  }

  /**
   * Set value in Redis cache with TTL
   */
  async set<T = any>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    if (!this.enableCache) return;

    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      this.logger.warn(
        `Cache set error for key ${key}: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }
  }

  /**
   * Get configured TTL by cache category
   */
  getTtl(category: 'global' | 'user' | 'contact' | 'media'): number {
    switch (category) {
      case 'global':
        return this.configService.get<number>('search.cache.ttlGlobalSearch', 30);
      case 'user':
        return this.configService.get<number>('search.cache.ttlUserScopedSearch', 30);
      case 'contact':
        return this.configService.get<number>('search.cache.ttlContactSearch', 30);
      case 'media':
        return this.configService.get<number>('search.cache.ttlMediaSearch', 30);
      default:
        return 30;
    }
  }

  /**
   * Delete a specific key from cache
   */
  async del(key: string): Promise<void> {
    if (!this.enableCache) return;

    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn(
        `Cache del error for key ${key}: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }
  }

  /**
   * Delete all cache keys matching a glob pattern.
   * Uses Redis SCAN (non-blocking) instead of KEYS command.
   *
   * Phase B (TD-09): Replaced broken `store.keys()` + regex with `RedisService.deletePattern()`.
   *
   * @param pattern - Redis glob pattern (e.g., `search:messages:conv123:*`)
   */
  async delByPattern(pattern: string): Promise<void> {
    if (!this.enableCache) return;

    try {
      const deletedCount = await this.redis.deletePattern(pattern);
      if (deletedCount > 0) {
        this.logger.debug(
          `Cache invalidated: ${deletedCount} keys matching pattern: ${pattern}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Cache delByPattern error for pattern ${pattern}: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      // Don't throw — cache errors should not break application
    }
  }

  /**
   * Clear all message search cache for a conversation (or all conversations)
   */
  async invalidateMessageSearchCache(conversationId?: string): Promise<void> {
    if (conversationId) {
      await this.delByPattern(`search:messages:${conversationId}:*`);
    } else {
      await this.delByPattern(`search:messages:*`);
    }
  }

  /**
   * Clear contact search cache for a user (or all users)
   */
  async invalidateContactSearchCache(userId?: string): Promise<void> {
    if (userId) {
      await this.delByPattern(`search:contacts:${userId}:*`);
      // Also invalidate contact lists for users who might have searched for this user
      await this.delByPattern(`search:contacts:*:${userId}:*`);
    } else {
      await this.delByPattern(`search:contacts:*`);
    }
  }

  /**
   * Clear global search cache
   */
  async invalidateGlobalSearchCache(userId?: string): Promise<void> {
    if (userId) {
      await this.delByPattern(`search:global:${userId}:*`);
      await this.delByPattern(`search:contacts:${userId}:*`);
    } else {
      await this.delByPattern(`search:*`);
    }
  }


  /**
   * Alias for invalidateMessageSearchCache (event-driven naming)
   */
  async invalidateConversationCache(conversationId: string): Promise<void> {
    return this.invalidateMessageSearchCache(conversationId);
  }

  /**
   * Alias for invalidateContactSearchCache (event-driven naming)
   */
  async invalidateUserCache(userId: string): Promise<void> {
    return this.invalidateContactSearchCache(userId);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    enabled: boolean;
    store?: string;
    error?: string;
  } {
    if (!this.enableCache) {
      return { enabled: false };
    }

    try {
      return {
        enabled: true,
        store: 'RedisService',
      };
    } catch (error) {
      return {
        enabled: true,
        error: error instanceof Error ? error.message : 'Unknown',
      };
    }
  }
}
