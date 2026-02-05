import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RedisService } from '@modules/redis/redis.service';

/**
 * PART 3.2: Cache Invalidation Listener
 *
 * Current Implementation: Single-instance environment ✓
 * - Works with load balancer + sticky sessions
 * - Suitable for MVP deployment phase
 *
 * Responsibility:
 * - Listen to 'cache.invalidate' events
 * - Delete cache keys from Redis
 * - Ensure cache consistency for block/unblock operations
 *
 * Usage:
 * - Emitted by BlockService when block/unblock operations complete
 * - Invalidates all affected cache keys in local Redis
 *
 * Current Scope: Single instance deployment ✓
 * - All requests routed to same instance (session affinity)
 * - Cache invalidation happens locally
 * - No need for cross-node synchronization yet
 *
 * Future Phase 2 Enhancement (100K+ users):
 * - Multi-node sync via Redis Pub/Sub
 * - Each node subscribes to 'cache-invalidation' channel
 * - Broadcast changes to all replicas
 * - See TODO comments below for implementation details
 */
@Injectable()
export class CacheInvalidationListener {
  private readonly logger = new Logger(CacheInvalidationListener.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Handle cache invalidation event
   *
   * Event emitted by:
   * - BlockService.blockUser() - invalidates block + permission caches
   * - BlockService.unblockUser() - invalidates permission caches
   *
   * Event payload:
   * {
   *   keys: string[] - Redis keys to invalidate
   *   reason: string - Why invalidation occurred (for logging)
   * }
   */
  @OnEvent('cache.invalidate')
  async handleCacheInvalidation(event: {
    keys: string[];
    reason: string;
  }): Promise<void> {
    const { keys, reason } = event;

    if (!keys || keys.length === 0) {
      this.logger.warn(`[CACHE] Invalidation event with no keys: ${reason}`);
      return;
    }

    try {
      this.logger.debug(
        `[CACHE] Invalidating ${keys.length} keys (${reason}): ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`,
      );

      // Delete from Redis (current node)
      await this.redis.del(...keys);

      this.logger.debug(`[CACHE] ✅ Deleted ${keys.length} keys from Redis`);

      // PART 3.2: Multi-node cache invalidation
      // Current: Single-node implementation (MVP phase) ✓
      // Scope: Works with sticky session + load balancer
      //
      // Phase 2 Enhancement (needed for independent replicas):
      // Publish to Redis Pub/Sub channel for cross-node sync
      //
      // Implementation plan:
      // 1. Publish: await this.redis.publish('cache-invalidate', JSON.stringify(event));
      // 2. Subscribe: (in module.onApplicationBootstrap)
      //    const subscriber = this.redis.duplicate();
      //    await subscriber.subscribe('cache-invalidate');
      //    subscriber.on('message', async (channel, msg) => {
      //      const { keys } = JSON.parse(msg);
      //      await this.redis.del(...keys);
      //    });
      // 3. Prevent loops: add source identifier to event
      //
      // For now: Local invalidation only (single instance) ✓

      // Future enhancement for multi-node:
      // const shouldPublish = keys.length > 0 && reason !== 'listener-sync'; // Avoid loops
      // if (shouldPublish) {
      //   await this.redis.publish('cache-invalidation', JSON.stringify({
      //     keys,
      //     reason: `${reason} [published]`,
      //     timestamp: new Date().toISOString(),
      //   }));
      //   this.logger.debug(`[CACHE] Published invalidation to other nodes`);
      // }
    } catch (error) {
      this.logger.error(
        `[CACHE] ❌ Failed to invalidate cache keys: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );

      // Don't throw - cache invalidation failures shouldn't break the request
      // But log it for monitoring
    }
  }

  /**
   * Alternative: Subscribe to Redis channel for multi-node invalidation
   * Call this in onApplicationBootstrap() to enable cross-node sync
   *
   * Example implementation:
   * ```typescript
   * async subscribeToMultiNodeInvalidation(): Promise<void> {
   *   try {
   *     const subscriber = this.redis.getSubscriber();
   *     subscriber.on('message', async (channel: string, message: string) => {
   *       if (channel !== 'cache-invalidation') return;
   *
   *       const event = JSON.parse(message);
   *       this.logger.debug(
   *         `[CACHE] Received multi-node invalidation: ${event.reason}`,
   *       );
   *       await this.redis.del(...event.keys);
   *     });
   *
   *     await subscriber.subscribe('cache-invalidation');
   *     this.logger.log('[CACHE] Subscribed to multi-node cache invalidation channel');
   *   } catch (error) {
   *     this.logger.error('[CACHE] Failed to subscribe to invalidation channel', error);
   *   }
   * }
   * ```
   */
}
