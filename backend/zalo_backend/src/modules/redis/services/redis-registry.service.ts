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

    // Get userId before deleting to clean up the set
    const userId = await client.hget(
      RedisKeyBuilder.socketUser(socketId),
      'userId',
    );

    const pipeline = client.pipeline();

    // Delete socket metadata
    pipeline.del(RedisKeyBuilder.socketUser(socketId));

    if (userId) {
      // Remove socketId from user's socket set
      pipeline.srem(RedisKeyBuilder.userSockets(userId), socketId);
    }

    await pipeline.exec();

    this.logger.debug(
      `Socket unregistered: ${socketId} ${userId ? `for user ${userId}` : ''}`,
    );
  }

  /**
   * Get all socketIds for a user
   * IMPROVED: Lazy Cleanup (Self-healing)
   * Tự động loại bỏ các socket ID "ma" (ID tồn tại trong Set nhưng mất Metadata)
   */
  async getUserSockets(userId: string): Promise<string[]> {
    const client = this.redisService.getClient();

    // 1. Lấy tất cả ID từ Set
    const socketIds = await client.smembers(
      RedisKeyBuilder.userSockets(userId),
    );

    if (socketIds.length === 0) return [];

    const activeSocketIds: string[] = [];
    const pipeline = client.pipeline();

    // 2. Kiểm tra xem Metadata của từng socket còn tồn tại không
    socketIds.forEach((id) => {
      pipeline.exists(RedisKeyBuilder.socketUser(id));
    });

    const results = await pipeline.exec();

    // Pipeline xử lý dọn dẹp ngầm
    const cleanupPipeline = client.pipeline();
    let needsCleanup = false;

    if (results) {
      results.forEach((result, index) => {
        const [err, exists] = result;
        // exists === 1 nghĩa là key còn sống
        if (!err && exists === 1) {
          activeSocketIds.push(socketIds[index]);
        } else {
          // Socket ID này là rác (Metadata đã hết hạn/bị xóa), cần xóa khỏi Set
          cleanupPipeline.srem(
            RedisKeyBuilder.userSockets(userId),
            socketIds[index],
          );
          needsCleanup = true;
        }
      });
    }

    // 3. Thực hiện dọn dẹp (Fire-and-forget, không cần await để chặn response)
    if (needsCleanup) {
      void cleanupPipeline
        .exec()
        .catch((err) =>
          this.logger.error(`Lazy cleanup failed for user ${userId}:`, err),
        );
      this.logger.debug(`Lazy cleaned up sockets for user ${userId}`);
    }

    return activeSocketIds;
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
    // Tận dụng logic Lazy Cleanup của getUserSockets
    const sockets = await this.getUserSockets(userId);
    return sockets.length > 0;
  }

  /**
   * Get count of user's active sockets
   */
  async getUserSocketCount(userId: string): Promise<number> {
    const sockets = await this.getUserSockets(userId);
    return sockets.length;
  }

  /**
   * Get all active socket IDs (across all users)
   */
  /**
   * Get all active socket IDs (across all users)
   * IMPROVED: Use SCAN instead of KEYS
   */
  async getAllActiveSockets(): Promise<string[]> {
    const client = this.redisService.getClient();
    const pattern = `${this.config.prefixes.socket}:*:${this.config.prefixes.user}`;
    const socketIds: string[] = [];

    // Sử dụng ScanStream để duyệt qua keys an toàn (Non-blocking)
    const stream = client.scanStream({
      match: pattern,
      count: 100, // Batch size
    });
    for await (const chunk of stream) {
      const keys = chunk as string[];
      if (keys.length > 0) {
        // Key format: socket:{socketId}:user -> Extract socketId
        keys.forEach((key) => {
          // Giả định format key là prefix:ID:suffix, cần parse đúng theo RedisKeyBuilder
          // RedisKeyBuilder.socketUser(id) -> "socket:{id}:user"
          const parts = key.split(':');
          // Tìm phần tử nằm giữa socket và user.
          // Nếu prefix config phức tạp hơn thì logic này cần chỉnh sửa.
          // Ở đây assume default: "socket:ID:user" -> ID là parts[1]
          if (parts.length >= 2) {
            socketIds.push(parts[1]);
          }
        });
      }
    }

    return socketIds;
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
   * IMPROVED: Use SCAN instead of KEYS
   */
  async cleanupZombieSockets(): Promise<number> {
    const client = this.redisService.getClient();
    const pattern = `${this.config.prefixes.socket}:*:${this.config.prefixes.user}`;
    let cleaned = 0;

    // Sử dụng ScanStream
    const stream = client.scanStream({
      match: pattern,
      count: 100,
    });

    for await (const chunk of stream) {
      const keys = chunk as string[];
      if (keys.length > 0) {
        const pipeline = client.pipeline();

        // Check TTL cho cả batch
        for (const key of keys) {
          pipeline.ttl(key);
        }

        const results = await pipeline.exec();

        if (results) {
          // Pipeline delete riêng
          const deletePipeline = client.pipeline();
          let hasDeletes = false;

          results.forEach((result, index) => {
            const [err, ttl] = result;
            // Nếu TTL = -1 (Persistent key - Lỗi logic vì lẽ ra phải có TTL)
            // Chúng ta coi đây là Zombie cần dọn dẹp
            if (!err && ttl === -1) {
              const key = keys[index];
              // const socketId = key.split(':')[1]; // Extract ID

              // Xóa key metadata
              deletePipeline.del(key);
              // Lưu ý: Ta không xóa trong Set ở đây vì Lazy Cleanup sẽ lo việc đó
              // hoặc gọi this.unregisterSocket(socketId) nhưng sẽ chậm hơn.
              // Để nhanh, ta chỉ xóa Metadata "bất tử" này đi.

              cleaned++;
              hasDeletes = true;
            }
          });

          if (hasDeletes) {
            await deletePipeline.exec();
          }
        }
      }
    }

    if (cleaned > 0) {
      this.logger.log(
        `Cleaned up ${cleaned} zombie sockets (persistent keys removed)`,
      );
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
