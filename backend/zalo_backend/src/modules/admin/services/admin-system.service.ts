import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';

/**
 * AdminSystemService
 *
 * Handles:
 * - GET /admin/system/status → health check (Redis, DB, S3, sockets)
 */
@Injectable()
export class AdminSystemService {
      private readonly logger = new Logger(AdminSystemService.name);

      constructor(
            private readonly prisma: PrismaService,
            private readonly redis: RedisService,
      ) { }

      async getSystemStatus() {
            const [redisHealth, dbHealth, activeConnections, storageStats] =
                  await Promise.all([
                        this.checkRedis(),
                        this.checkDatabase(),
                        this.getActiveSocketConnections(),
                        this.getStorageStats(),
                  ]);

            return {
                  redis: redisHealth,
                  database: dbHealth,
                  storage: storageStats,
                  activeSocketConnections: activeConnections,
                  timestamp: new Date().toISOString(),
            };
      }

      // ─── Private helpers ──────────────────────────────────────────────────

      private async checkRedis(): Promise<{
            connected: boolean;
            latencyMs: number;
      }> {
            try {
                  const start = Date.now();
                  const client = this.redis.getClient();
                  await client.ping();
                  return { connected: true, latencyMs: Date.now() - start };
            } catch (err) {
                  this.logger.warn(`Redis health check failed: ${err}`);
                  return { connected: false, latencyMs: -1 };
            }
      }

      private async checkDatabase(): Promise<{
            connected: boolean;
            latencyMs: number;
      }> {
            try {
                  const start = Date.now();
                  await this.prisma.$queryRaw`SELECT 1`;
                  return { connected: true, latencyMs: Date.now() - start };
            } catch (err) {
                  this.logger.warn(`Database health check failed: ${err}`);
                  return { connected: false, latencyMs: -1 };
            }
      }

      private async getActiveSocketConnections(): Promise<number> {
            try {
                  return await this.prisma.socketConnection.count({
                        where: { disconnectedAt: null },
                  });
            } catch {
                  return 0;
            }
      }

      private async getStorageStats(): Promise<{
            connected: boolean;
            totalFiles: number;
            usedBytes: string;
      }> {
            try {
                  const result = await this.prisma.mediaAttachment.aggregate({
                        _count: { id: true },
                        _sum: { size: true },
                        where: { deletedAt: null },
                  });
                  return {
                        connected: true,
                        totalFiles: result._count.id,
                        usedBytes: (result._sum.size ?? BigInt(0)).toString(),
                  };
            } catch (err) {
                  this.logger.warn(`Storage stats check failed: ${err}`);
                  return { connected: false, totalFiles: 0, usedBytes: '0' };
            }
      }
}
