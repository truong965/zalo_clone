import { Injectable, Logger, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { RedisService } from '../redis.service';
import { RedisKeyBuilder } from '../../../common/constants/redis-keys.constant';
import { PresenceStatus } from '../../../common/interfaces/presence-data.interface';
import redisConfig from '../../../config/redis.config';

@Injectable()
export class RedisPresenceService {
  private readonly logger = new Logger(RedisPresenceService.name);

  constructor(
    private readonly redisService: RedisService,
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
  ) {}

  /**
   * Mark user as online with device
   */
  async setUserOnline(userId: string, deviceId: string): Promise<void> {
    const client = this.redisService.getClient();
    const timestamp = Date.now();

    const pipeline = client.pipeline();

    // Add to online users sorted set
    pipeline.zadd('presence:online_users', timestamp, userId);

    // Set user status
    pipeline.set(
      RedisKeyBuilder.userStatus(userId),
      PresenceStatus.ONLINE,
      'EX',
      this.config.ttl.userStatus,
    );

    // Add device to user's device set
    pipeline.sadd(RedisKeyBuilder.userDevices(userId), deviceId);

    await pipeline.exec();

    this.logger.debug(`User ${userId} marked as online (device: ${deviceId})`);
  }

  /**
   * Remove device from user's presence
   * If last device, mark user as offline
   */
  async removeUserDevice(userId: string, deviceId: string): Promise<boolean> {
    const client = this.redisService.getClient();

    // Remove device from set
    await client.srem(RedisKeyBuilder.userDevices(userId), deviceId);

    // Check if user has any devices left
    const deviceCount = await client.scard(RedisKeyBuilder.userDevices(userId));

    if (deviceCount === 0) {
      // Last device - mark user as offline
      await this.setUserOffline(userId);
      return true; // User is now offline
    }

    return false; // User still has other devices online
  }

  /**
   * Mark user as offline
   */
  async setUserOffline(userId: string): Promise<void> {
    const client = this.redisService.getClient();

    const pipeline = client.pipeline();

    // Remove from online users sorted set
    pipeline.zrem('presence:online_users', userId);

    // Delete user status
    pipeline.del(RedisKeyBuilder.userStatus(userId));

    // Delete user devices set
    pipeline.del(RedisKeyBuilder.userDevices(userId));

    await pipeline.exec();

    this.logger.debug(`User ${userId} marked as offline`);
  }

  /**
   * Get user's current status
   */
  async getUserStatus(userId: string): Promise<PresenceStatus | null> {
    const client = this.redisService.getClient();
    const status = await client.get(RedisKeyBuilder.userStatus(userId));
    return status as PresenceStatus | null;
  }

  /**
   * Check if user is online
   */
  async isUserOnline(userId: string): Promise<boolean> {
    const status = await this.getUserStatus(userId);
    return status === PresenceStatus.ONLINE;
  }

  /**
   * Get all online user IDs
   */
  async getOnlineUsers(): Promise<string[]> {
    const client = this.redisService.getClient();
    return client.zrange('presence:online_users', 0, -1);
  }

  /**
   * Get online user count
   */
  async getOnlineUserCount(): Promise<number> {
    const client = this.redisService.getClient();
    return client.zcard('presence:online_users');
  }

  /**
   * Get user's connected devices
   */
  async getUserDevices(userId: string): Promise<string[]> {
    const client = this.redisService.getClient();
    return client.smembers(RedisKeyBuilder.userDevices(userId));
  }

  /**
   * Refresh user's presence TTL (heartbeat)
   */
  async refreshUserPresence(userId: string): Promise<void> {
    const client = this.redisService.getClient();
    const timestamp = Date.now();

    const pipeline = client.pipeline();

    // Update score in sorted set
    pipeline.zadd('presence:online_users', timestamp, userId);

    // Refresh status TTL
    pipeline.expire(
      RedisKeyBuilder.userStatus(userId),
      this.config.ttl.userStatus,
    );

    await pipeline.exec();
  }

  /**
   * Cleanup stale presences (users whose TTL expired)
   * Should be called by a cron job
   */
  async cleanupStalePresence(): Promise<number> {
    const client = this.redisService.getClient();
    const fiveMinutesAgo = Date.now() - this.config.ttl.userStatus * 1000;

    // Remove users who haven't refreshed in 5 minutes
    const removed = await client.zremrangebyscore(
      'presence:online_users',
      '-inf',
      fiveMinutesAgo,
    );

    if (removed > 0) {
      this.logger.log(`Cleaned up ${removed} stale presence records`);
    }

    return removed;
  }

  /**
   * Get users online in the last N seconds
   */
  async getRecentlyOnlineUsers(seconds: number): Promise<string[]> {
    const client = this.redisService.getClient();
    const cutoff = Date.now() - seconds * 1000;

    return client.zrangebyscore('presence:online_users', cutoff, '+inf');
  }
}
