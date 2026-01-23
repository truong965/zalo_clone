import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisRegistryService } from 'src/modules/redis/services/redis-registry.service';
import { RedisPresenceService } from 'src/modules/redis/services/redis-presence.service';
import { SocketConnectionLoggerService } from '../services/socket-connection-logger.service';

@Injectable()
export class SocketCleanupJob {
  private readonly logger = new Logger(SocketCleanupJob.name);

  constructor(
    private readonly redisRegistry: RedisRegistryService,
    private readonly redisPresence: RedisPresenceService,
    private readonly connectionLogger: SocketConnectionLoggerService,
  ) {}

  /**
   * Chạy mỗi giờ (Every Hour)
   * Mục tiêu: Dọn dẹp các kết nối "ma" (Zombie) do server crash hoặc lỗi mạng
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup() {
    this.logger.log('🧹 Starting scheduled socket cleanup...');

    try {
      // 1. Dọn dẹp Socket Metadata bị treo trong Redis (hết hạn TTL)
      // Reference: RedisRegistryService.cleanupZombieSockets
      const zombiesCleaned = await this.redisRegistry.cleanupZombieSockets();

      // 2. Dọn dẹp User Presence không còn active
      // Reference: RedisPresenceService.cleanupStalePresence
      const stalePresenceCleaned =
        await this.redisPresence.cleanupStalePresence();

      // 3. Dọn dẹp Log kết nối cũ trong DB (Giữ lại 7 ngày)
      // Reference: SocketConnectionLoggerService.cleanupOldLogs
      const logsCleaned = await this.connectionLogger.cleanupOldLogs(7);

      if (zombiesCleaned > 0 || stalePresenceCleaned > 0 || logsCleaned > 0) {
        this.logger.log(
          ` Cleanup Report: ${zombiesCleaned} zombies, ${stalePresenceCleaned} stale presences, ${logsCleaned} old logs removed.`,
        );
      } else {
        this.logger.debug(' System is clean. Nothing to remove.');
      }
    } catch (error) {
      this.logger.error(' Error during socket cleanup job:', error);
    }
  }
}
