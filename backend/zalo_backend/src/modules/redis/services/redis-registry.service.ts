import { Injectable, Logger, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { RedisService } from '../redis.service';
import { RedisKeyBuilder } from '../../../common/constants/redis-keys.constant';
import { SocketMetadata } from '../../../common/interfaces/socket-client.interface';
import redisConfig from '../../../config/redis.config';

@Injectable()
export class RedisRegistryService {
  private readonly logger = new Logger(RedisRegistryService.name);

  constructor(
    private readonly redisService: RedisService,
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
  ) {}

  /**
   * Register socket connection
   */
  async registerSocket(metadata: SocketMetadata): Promise<void> {
    const client = this.redisService.getClient();

    const pipeline = client.pipeline();

    // Add socketId to user's socket set
    pipeline.sadd(
      RedisKeyBuilder.userSockets(metadata.userId),
      metadata.socketId,
    );

    // Store socket metadata as hash
    pipeline.hset(RedisKeyBuilder.socketUser(metadata.socketId), {
      userId: metadata.userId,
      deviceId: metadata.deviceId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      connectedAt: metadata.connectedAt.toISOString(),
      serverInstance: metadata.serverInstance,
    });

    // Set TTL on socket metadata (cleanup for zombie connections)
    pipeline.expire(
      RedisKeyBuilder.socketUser(metadata.socketId),
      this.config.ttl.socketMetadata,
    );

    await pipeline.exec();

    this.logger.debug(
      `Socket registered: ${metadata.socketId} for user ${metadata.userId}`,
    );
  }

  /**
   * Unregister socket connection
   */
  async unregisterSocket(socketId: string): Promise<void> {
    const client = this.redisService.getClient();

    // Get userId before deleting
    const userId = await client.hget(
      RedisKeyBuilder.socketUser(socketId),
      'userId',
    );

    if (!userId) {
      this.logger.warn(`Socket ${socketId} not found in registry`);
      return;
    }

    const pipeline = client.pipeline();

    // Remove socketId from user's socket set
    pipeline.srem(RedisKeyBuilder.userSockets(userId), socketId);

    // Delete socket metadata
    pipeline.del(RedisKeyBuilder.socketUser(socketId));

    await pipeline.exec();

    this.logger.debug(`Socket unregistered: ${socketId} for user ${userId}`);
  }

  /**
   * Get all socketIds for a user
   */
  async getUserSockets(userId: string): Promise<string[]> {
    const client = this.redisService.getClient();
    return client.smembers(RedisKeyBuilder.userSockets(userId));
  }

  /**
   * Get userId for a socket
   */
  async getSocketUser(socketId: string): Promise<string | null> {
    const client = this.redisService.getClient();
    return client.hget(RedisKeyBuilder.socketUser(socketId), 'userId');
  }

  /**
   * Get socket metadata
   */
  async getSocketMetadata(socketId: string): Promise<SocketMetadata | null> {
    const client = this.redisService.getClient();
    const data = await client.hgetall(RedisKeyBuilder.socketUser(socketId));

    if (!data || !data.userId) {
      return null;
    }

    return {
      socketId,
      userId: data.userId,
      deviceId: data.deviceId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      connectedAt: new Date(data.connectedAt),
      serverInstance: data.serverInstance,
    };
  }

  /**
   * Check if user has any active sockets
   */
  async hasActiveSockets(userId: string): Promise<boolean> {
    const client = this.redisService.getClient();
    const count = await client.scard(RedisKeyBuilder.userSockets(userId));
    return count > 0;
  }

  /**
   * Get count of user's active sockets
   */
  async getUserSocketCount(userId: string): Promise<number> {
    const client = this.redisService.getClient();
    return client.scard(RedisKeyBuilder.userSockets(userId));
  }

  /**
   * Get all active socket IDs (across all users)
   */
  async getAllActiveSockets(): Promise<string[]> {
    const client = this.redisService.getClient();
    const pattern = `${this.config.prefixes.socket}:*:${this.config.prefixes.user}`;

    const keys = await client.keys(pattern);
    return keys.map((key) => key.split(':')[1]); // Extract socketId from key
  }

  /**
   * Get total active socket count
   */
  async getTotalSocketCount(): Promise<number> {
    const sockets = await this.getAllActiveSockets();
    return sockets.length;
  }

  /**
   * Cleanup zombie sockets (expired TTL)
   * Should be called by a cron job
   */
  async cleanupZombieSockets(): Promise<number> {
    const client = this.redisService.getClient();
    const pattern = `${this.config.prefixes.socket}:*:${this.config.prefixes.user}`;

    const keys = await client.keys(pattern);
    let cleaned = 0;

    for (const key of keys) {
      const ttl = await client.ttl(key);
      if (ttl < 0) {
        // No TTL or expired
        const socketId = key.split(':')[1];
        await this.unregisterSocket(socketId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} zombie sockets`);
    }

    return cleaned;
  }

  /**
   * Refresh socket TTL (heartbeat)
   */
  async refreshSocketTTL(socketId: string): Promise<void> {
    const client = this.redisService.getClient();
    await client.expire(
      RedisKeyBuilder.socketUser(socketId),
      this.config.ttl.socketMetadata,
    );
  }
}
