import { Injectable, Logger, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { RedisService } from '../redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import redisConfig from '../../../config/redis.config';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

@Injectable()
export class RedisRateLimitService {
  private readonly logger = new Logger(RedisRateLimitService.name);

  constructor(
    private readonly redisService: RedisService,
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
  ) {}

  /**
   * Check and increment rate limit for messages
   * Limit: 30 messages per minute
   */
  async checkMessageRateLimit(userId: string): Promise<RateLimitResult> {
    const key = RedisKeyBuilder.rateLimitMessages(userId);
    const limit = this.config.rateLimit.messagesPerMinute;
    const window = this.config.ttl.rateLimitWindow; // 60 seconds

    return this.checkRateLimit(key, limit, window);
  }

  /**
   * Check and increment rate limit for socket events
   * Limit: 100 events per 10 seconds
   */
  async checkEventRateLimit(socketId: string): Promise<RateLimitResult> {
    const key = RedisKeyBuilder.rateLimitEvents(socketId);
    const limit = this.config.rateLimit.eventsPerTenSeconds;
    const window = this.config.ttl.rateLimitEventWindow; // 10 seconds

    return this.checkRateLimit(key, limit, window);
  }

  /**
   * Generic rate limit check with sliding window
   */
  private async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const client = this.redisService.getClient();

    // Use Lua script for atomic increment + TTL check
    const script = `
      local current = redis.call('incr', KEYS[1])
      if current == 1 then
        redis.call('expire', KEYS[1], ARGV[1])
      end
      local ttl = redis.call('ttl', KEYS[1])
      return {current, ttl}
    `;

    const result = await client.eval(script, 1, key, windowSeconds);
    const [count, ttl] = result as [number, number];

    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    const resetAt = new Date(Date.now() + ttl * 1000);

    if (!allowed) {
      this.logger.warn(
        `Rate limit exceeded for key: ${key} (${count}/${limit})`,
      );
    }

    return {
      allowed,
      remaining,
      resetAt,
    };
  }

  /**
   * Get current count for a rate limit key
   */
  async getCurrentCount(key: string): Promise<number> {
    const client = this.redisService.getClient();
    const count = await client.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  /**
   * Reset rate limit for a key
   */
  async resetRateLimit(key: string): Promise<void> {
    const client = this.redisService.getClient();
    await client.del(key);
  }

  /**
   * Get TTL for a rate limit key
   */
  async getRateLimitTTL(key: string): Promise<number> {
    const client = this.redisService.getClient();
    return client.ttl(key);
  }

  /**
   * Cleanup expired rate limit keys
   * (Redis handles this automatically with TTL, but useful for manual cleanup)
   */
  async cleanupExpiredRateLimits(): Promise<number> {
    const client = this.redisService.getClient();
    const pattern = `${this.config.prefixes.rateLimit}:*`;

    const keys = await client.keys(pattern);
    let cleaned = 0;

    for (const key of keys) {
      const ttl = await client.ttl(key);
      if (ttl < 0) {
        await client.del(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired rate limit keys`);
    }

    return cleaned;
  }
}
