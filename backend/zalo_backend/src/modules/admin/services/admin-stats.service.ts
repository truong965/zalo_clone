import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { RedisPresenceService } from '@modules/redis/services/redis-presence.service';
import { DailyStatsQueryDto } from '../dto/daily-stats-query.dto';
import { STATS_KEYS, todayICT } from '../listeners/stats-counter.listener';
import { UserStatus } from '@prisma/client';

/**
 * AdminStatsService
 *
 * Handles:
 * - GET /admin/stats/overview  → real-time Redis counters
 * - GET /admin/stats/daily     → DailyStats table (historical)
 */
@Injectable()
export class AdminStatsService {
      private readonly logger = new Logger(AdminStatsService.name);

      constructor(
            private readonly prisma: PrismaService,
            private readonly redis: RedisService,
            private readonly presence: RedisPresenceService,
      ) { }

      /**
       * Real-time KPI overview from Redis counters.
       * Falls back to Prisma COUNT for stats:users:total if Redis key missing.
       */
      async getOverview() {
            const client = this.redis.getClient();
            const today = todayICT();

            const [totalUsersRaw, onlineUsers, messagesTodayRaw, callsTodayRaw] =
                  await Promise.all([
                        client.get(STATS_KEYS.USERS_TOTAL),
                        this.presence.getOnlineUserCount(),
                        client.get(STATS_KEYS.MESSAGES_DAILY(today)),
                        client.get(STATS_KEYS.CALLS_DAILY(today)),
                  ]);

            // Fallback: if Redis key is missing, count from Postgres and re-seed
            let totalUsers = totalUsersRaw ? parseInt(totalUsersRaw, 10) : 0;
            if (!totalUsersRaw) {
                  totalUsers = await this.prisma.user.count({
                        where: { status: { not: UserStatus.DELETED } },
                  });
                  await client.set(STATS_KEYS.USERS_TOTAL, totalUsers).catch((err) => {
                        this.logger.warn(`Failed to re-seed stats:users:total: ${err}`);
                  });
            }

            return {
                  totalUsers,
                  onlineUsers,
                  messagesToday: messagesTodayRaw ? parseInt(messagesTodayRaw, 10) : 0,
                  callsToday: callsTodayRaw ? parseInt(callsTodayRaw, 10) : 0,
            };
      }

      /**
       * Historical daily stats from DailyStats table.
       * Default: last 30 days.
       */
      async getDailyStats(dto: DailyStatsQueryDto) {
            const to = dto.to ? new Date(dto.to) : new Date();
            const from = dto.from
                  ? new Date(dto.from)
                  : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

            const rows = await this.prisma.dailyStats.findMany({
                  where: {
                        date: { gte: from, lte: to },
                  },
                  orderBy: { date: 'asc' },
            });

            // Serialize BigInt → string for JSON safety
            return rows.map((r) => ({
                  ...r,
                  mediaBytes: r.mediaBytes.toString(),
            }));
      }
}
