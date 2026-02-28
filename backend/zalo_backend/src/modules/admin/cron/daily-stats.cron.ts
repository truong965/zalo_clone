import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@database/prisma.service';
import { CallStatus, UserStatus } from '@prisma/client';

/**
 * Return the ICT (UTC+7) start-of-day for a given Date in **UTC**.
 * E.g. if `d` is 2026-02-28T00:00Z → returns 2026-02-28T00:00+07 = 2026-02-27T17:00Z
 */
function ictDayRangeUTC(d: Date): { start: Date; end: Date } {
      // Clone & shift to ICT midnight
      const ict = new Date(d.getTime() + 7 * 60 * 60 * 1000);
      ict.setUTCHours(0, 0, 0, 0);
      // Shift back to UTC
      const start = new Date(ict.getTime() - 7 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
      return { start, end };
}

/**
 * Return only the date portion (no time) for Prisma @db.Date columns.
 */
function dateOnly(d: Date): Date {
      const ict = new Date(d.getTime() + 7 * 60 * 60 * 1000);
      return new Date(
            Date.UTC(ict.getUTCFullYear(), ict.getUTCMonth(), ict.getUTCDate()),
      );
}

/**
 * DailyStatsCron
 *
 * Runs daily at 00:05 ICT (17:05 UTC of the previous day) to aggregate
 * the previous day's statistics into the `DailyStats` table.
 *
 * Also exposes `backfill(from, to)` for seeding historical data on
 * first deploy or after data corrections.
 */
@Injectable()
export class DailyStatsCron {
      private readonly logger = new Logger(DailyStatsCron.name);

      constructor(private readonly prisma: PrismaService) { }

      // ── Scheduled trigger ────────────────────────────────────────────

      /**
       * 17:05 UTC = 00:05 ICT (next day).
       * We use the raw cron expression instead of CronExpression enum.
       */
      @Cron('5 17 * * *', { name: 'daily-stats-aggregate', timeZone: 'UTC' })
      async handleCron(): Promise<void> {
            // "Yesterday" in ICT: subtract 1 calendar day from ICT "now"
            const now = new Date();
            const ictNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
            const yesterday = new Date(ictNow);
            yesterday.setUTCDate(yesterday.getUTCDate() - 1);

            this.logger.log(`[CRON] Aggregating stats for ICT date ${yesterday.toISOString().slice(0, 10)}`);
            await this.aggregateDay(yesterday);
      }

      // ── Public API (for backfill endpoint / CLI) ─────────────────────

      /**
       * Backfill daily stats for a date range (inclusive).
       * Both `from` and `to` are interpreted as ICT calendar dates.
       */
      async backfill(from: Date, to: Date): Promise<number> {
            let count = 0;
            const cursor = new Date(from);

            while (cursor <= to) {
                  await this.aggregateDay(new Date(cursor));
                  cursor.setUTCDate(cursor.getUTCDate() + 1);
                  count++;
            }

            this.logger.log(`[BACKFILL] Aggregated ${count} day(s)`);
            return count;
      }

      // ── Core aggregation logic ───────────────────────────────────────

      /**
       * Aggregate a single ICT calendar day and upsert into DailyStats.
       * @param ictDate — any Date whose ICT calendar day we want to aggregate
       */
      private async aggregateDay(ictDate: Date): Promise<void> {
            const { start, end } = ictDayRangeUTC(ictDate);
            const dateKey = dateOnly(ictDate);

            try {
                  // Run all independent queries in parallel
                  const [
                        newUsers,
                        activeUsers,
                        messagesTotal,
                        messagesByTypeRaw,
                        callsTotal,
                        callsByTypeRaw,
                        callsByStatusRaw,
                        callAvgDurationRaw,
                        mediaUploads,
                        mediaBytesRaw,
                  ] = await Promise.all([
                        // 1. New users registered this day
                        this.prisma.user.count({
                              where: {
                                    createdAt: { gte: start, lte: end },
                                    status: { not: UserStatus.DELETED },
                              },
                        }),

                        // 2. Active users (distinct senders)
                        this.prisma.message.findMany({
                              where: {
                                    createdAt: { gte: start, lte: end },
                                    deletedAt: null,
                                    senderId: { not: null },
                              },
                              distinct: ['senderId'],
                              select: { senderId: true },
                        }),

                        // 3. Total messages
                        this.prisma.message.count({
                              where: { createdAt: { gte: start, lte: end }, deletedAt: null },
                        }),

                        // 4. Messages grouped by type
                        this.prisma.message.groupBy({
                              by: ['type'],
                              where: { createdAt: { gte: start, lte: end }, deletedAt: null },
                              _count: true,
                        }),

                        // 5. Total calls
                        this.prisma.callHistory.count({
                              where: { startedAt: { gte: start, lte: end }, deletedAt: null },
                        }),

                        // 6. Calls by type
                        this.prisma.callHistory.groupBy({
                              by: ['callType'],
                              where: { startedAt: { gte: start, lte: end }, deletedAt: null },
                              _count: true,
                        }),

                        // 7. Calls by status
                        this.prisma.callHistory.groupBy({
                              by: ['status'],
                              where: { startedAt: { gte: start, lte: end }, deletedAt: null },
                              _count: true,
                        }),

                        // 8. Average call duration (COMPLETED only)
                        this.prisma.callHistory.aggregate({
                              where: {
                                    startedAt: { gte: start, lte: end },
                                    status: CallStatus.COMPLETED,
                                    deletedAt: null,
                              },
                              _avg: { duration: true },
                        }),

                        // 9. Media uploads count
                        this.prisma.mediaAttachment.count({
                              where: { createdAt: { gte: start, lte: end }, deletedAt: null },
                        }),

                        // 10. Media bytes sum
                        this.prisma.mediaAttachment.aggregate({
                              where: { createdAt: { gte: start, lte: end }, deletedAt: null },
                              _sum: { size: true },
                        }),
                  ]);

                  // ── Transform grouped results into JSON objects ──────────────

                  const messagesByType: Record<string, number> = {};
                  for (const row of messagesByTypeRaw) {
                        messagesByType[row.type] = row._count;
                  }

                  const callsByType: Record<string, number> = {};
                  for (const row of callsByTypeRaw) {
                        callsByType[row.callType] = row._count;
                  }

                  const callsByStatus: Record<string, number> = {};
                  for (const row of callsByStatusRaw) {
                        callsByStatus[row.status] = row._count;
                  }

                  const callAvgDuration = Math.round(callAvgDurationRaw._avg.duration ?? 0);
                  const mediaBytes = mediaBytesRaw._sum.size ?? BigInt(0);

                  // ── Upsert ──────────────────────────────────────────────────

                  await this.prisma.dailyStats.upsert({
                        where: { date: dateKey },
                        create: {
                              date: dateKey,
                              newUsers,
                              activeUsers: activeUsers.length,
                              messagesTotal,
                              messagesByType,
                              callsTotal,
                              callsByType,
                              callsByStatus,
                              callAvgDuration,
                              mediaUploads,
                              mediaBytes,
                        },
                        update: {
                              newUsers,
                              activeUsers: activeUsers.length,
                              messagesTotal,
                              messagesByType,
                              callsTotal,
                              callsByType,
                              callsByStatus,
                              callAvgDuration,
                              mediaUploads,
                              mediaBytes,
                        },
                  });

                  this.logger.log(
                        `[AGG] ${dateKey.toISOString().slice(0, 10)}: ` +
                        `users=${newUsers}, active=${activeUsers.length}, msgs=${messagesTotal}, ` +
                        `calls=${callsTotal}, media=${mediaUploads}`,
                  );
            } catch (err) {
                  this.logger.error(
                        `[AGG] Failed for ${dateKey.toISOString().slice(0, 10)}: ${err}`,
                  );
                  throw err;
            }
      }
}
