import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';

/**
 * AdminActivityService
 *
 * Handles "anomaly detection" endpoints:
 * - GET /admin/activity/suspended     → users with status SUSPENDED
 * - GET /admin/activity/inactive      → users not seen in N days
 * - GET /admin/activity/high-activity → outlier users (spam detection)
 * - GET /admin/activity/multi-device  → users with >N active sessions
 */
@Injectable()
export class AdminActivityService {
      constructor(private readonly prisma: PrismaService) { }

      // ─── GET /admin/activity/suspended ────────────────────────────────────

      async getSuspendedUsers() {
            return this.prisma.user.findMany({
                  where: { status: UserStatus.SUSPENDED, deletedAt: null },
                  select: {
                        id: true,
                        displayName: true,
                        phoneNumber: true,
                        avatarUrl: true,
                        lastSeenAt: true,
                        updatedAt: true,
                  },
                  orderBy: { updatedAt: 'desc' },
            });
      }

      // ─── GET /admin/activity/inactive ─────────────────────────────────────

      async getInactiveUsers(days = 30) {
            days = Number(days) || 30;
            const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            return this.prisma.user.findMany({
                  where: {
                        status: UserStatus.ACTIVE,
                        deletedAt: null,
                        OR: [
                              { lastSeenAt: { lt: cutoff } },
                              { lastSeenAt: null },
                        ],
                  },
                  select: {
                        id: true,
                        displayName: true,
                        phoneNumber: true,
                        lastSeenAt: true,
                        createdAt: true,
                  },
                  orderBy: { lastSeenAt: { sort: 'asc', nulls: 'first' } },
                  take: 100,
            });
      }

      // ─── GET /admin/activity/high-activity ────────────────────────────────

      async getHighActivityUsers(hours = 24, threshold = 500) {
            hours = Number(hours) || 24;
            threshold = Number(threshold) || 500;

            const since = new Date(Date.now() - hours * 60 * 60 * 1000);

            // Group messages by sender in the given time window
            const results = await this.prisma.message.groupBy({
                  by: ['senderId'],
                  where: {
                        createdAt: { gte: since },
                        deletedAt: null,
                        senderId: { not: null },
                  },
                  _count: { id: true },
                  having: {
                        id: { _count: { gte: threshold } },
                  },
                  orderBy: { _count: { id: 'desc' } },
            });

            if (results.length === 0) return [];

            // Enrich with user details
            const userIds = results.map((r) => r.senderId!);
            const users = await this.prisma.user.findMany({
                  where: { id: { in: userIds } },
                  select: {
                        id: true,
                        displayName: true,
                        phoneNumber: true,
                        status: true,
                  },
            });

            const userMap = new Map(users.map((u) => [u.id, u]));

            return results.map((r) => ({
                  user: userMap.get(r.senderId!) ?? { id: r.senderId },
                  messageCount: r._count.id,
                  windowHours: hours,
            }));
      }

      // ─── GET /admin/activity/multi-device ─────────────────────────────────

      async getMultiDeviceUsers(minSessions = 3) {
            minSessions = Number(minSessions) || 3;

            // Group active (non-revoked) tokens by user
            const results = await this.prisma.userToken.groupBy({
                  by: ['userId'],
                  where: { isRevoked: false },
                  _count: { id: true },
                  having: {
                        id: { _count: { gte: minSessions } },
                  },
                  orderBy: { _count: { id: 'desc' } },
            });

            if (results.length === 0) return [];

            // Enrich with user details + session info
            const userIds = results.map((r) => r.userId);
            const [users, sessions] = await Promise.all([
                  this.prisma.user.findMany({
                        where: { id: { in: userIds } },
                        select: {
                              id: true,
                              displayName: true,
                              phoneNumber: true,
                              status: true,
                        },
                  }),
                  this.prisma.userToken.findMany({
                        where: { userId: { in: userIds }, isRevoked: false },
                        select: {
                              userId: true,
                              deviceId: true,
                              deviceName: true,
                              platform: true,
                              ipAddress: true,
                              lastUsedAt: true,
                        },
                        orderBy: { lastUsedAt: 'desc' },
                  }),
            ]);

            const userMap = new Map(users.map((u) => [u.id, u]));
            const sessionMap = new Map<string, typeof sessions>();
            for (const s of sessions) {
                  if (!sessionMap.has(s.userId)) sessionMap.set(s.userId, []);
                  sessionMap.get(s.userId)!.push(s);
            }

            return results.map((r) => ({
                  user: userMap.get(r.userId) ?? { id: r.userId },
                  sessionCount: r._count.id,
                  sessions: sessionMap.get(r.userId) ?? [],
            }));
      }
}
