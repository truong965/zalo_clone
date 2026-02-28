import {
      BadRequestException,
      Injectable,
      Logger,
      NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, TokenRevocationReason, UserStatus } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { TokenService } from '@modules/auth/services/token.service';
import { UserListQueryDto } from '../dto/user-list-query.dto';

/**
 * AdminUsersService
 *
 * Handles:
 * - GET    /admin/users              → paginated list with filters
 * - GET    /admin/users/:id          → user detail + activity summary + sessions
 * - PATCH  /admin/users/:id/suspend  → suspend user + force logout
 * - PATCH  /admin/users/:id/activate → reactivate suspended user
 * - POST   /admin/users/:id/force-logout → revoke all sessions
 */
@Injectable()
export class AdminUsersService {
      private readonly logger = new Logger(AdminUsersService.name);

      constructor(
            private readonly prisma: PrismaService,
            private readonly tokenService: TokenService,
            private readonly eventEmitter: EventEmitter2,
      ) { }

      // ─── GET /admin/users ─────────────────────────────────────────────────

      async getUsers(dto: UserListQueryDto) {
            const page = dto.page ?? 1;
            const limit = dto.limit ?? 20;
            const skip = (page - 1) * limit;

            const where: Prisma.UserWhereInput = {
                  deletedAt: null,
            };

            if (dto.status) {
                  where.status = dto.status;
            }

            if (dto.search) {
                  where.OR = [
                        { displayName: { contains: dto.search, mode: 'insensitive' } },
                        { phoneNumber: { contains: dto.search } },
                  ];
            }

            if (dto.dateFrom || dto.dateTo) {
                  where.createdAt = {};
                  if (dto.dateFrom) where.createdAt.gte = new Date(dto.dateFrom);
                  if (dto.dateTo) where.createdAt.lte = new Date(dto.dateTo);
            }

            // Filter by platform: user must have at least one active token on that platform
            if (dto.platform) {
                  where.tokens = {
                        some: {
                              platform: dto.platform as any,
                              isRevoked: false,
                        },
                  };
            }

            const [data, total] = await Promise.all([
                  this.prisma.user.findMany({
                        where,
                        select: {
                              id: true,
                              displayName: true,
                              phoneNumber: true,
                              avatarUrl: true,
                              status: true,
                              lastSeenAt: true,
                              createdAt: true,
                        },
                        orderBy: { createdAt: 'desc' },
                        skip,
                        take: limit,
                  }),
                  this.prisma.user.count({ where }),
            ]);

            return { data, total, page, limit };
      }

      // ─── GET /admin/users/:id ─────────────────────────────────────────────

      async getUserDetail(userId: string) {
            const user = await this.prisma.user.findUnique({
                  where: { id: userId },
                  select: {
                        id: true,
                        displayName: true,
                        phoneNumber: true,
                        avatarUrl: true,
                        bio: true,
                        dateOfBirth: true,
                        gender: true,
                        status: true,
                        lastSeenAt: true,
                        createdAt: true,
                        role: { select: { name: true } },
                  },
            });

            if (!user) throw new NotFoundException('User not found');

            // Activity summary: parallel queries
            const [messageCount, callStats, activeSessions] = await Promise.all([
                  this.prisma.message.count({
                        where: { senderId: userId, deletedAt: null },
                  }),
                  this.prisma.callHistory.groupBy({
                        by: ['callType'],
                        where: { initiatorId: userId, deletedAt: null },
                        _count: { id: true },
                  }),
                  this.prisma.userToken.findMany({
                        where: { userId, isRevoked: false },
                        select: {
                              id: true,
                              deviceId: true,
                              deviceName: true,
                              platform: true,
                              ipAddress: true,
                              lastUsedAt: true,
                              issuedAt: true,
                        },
                        orderBy: { lastUsedAt: 'desc' },
                  }),
            ]);

            const callSummary = callStats.reduce(
                  (acc, row) => {
                        acc[row.callType] = row._count.id;
                        return acc;
                  },
                  {} as Record<string, number>,
            );

            return {
                  profile: user,
                  activitySummary: {
                        messageCount,
                        calls: callSummary,
                  },
                  activeSessions,
            };
      }

      // ─── PATCH /admin/users/:id/suspend ───────────────────────────────────

      async suspendUser(userId: string, adminId: string) {
            if (userId === adminId) {
                  throw new BadRequestException('Cannot suspend yourself');
            }

            const user = await this.prisma.user.findUnique({
                  where: { id: userId },
                  select: { id: true, status: true },
            });

            if (!user) throw new NotFoundException('User not found');
            if (user.status === UserStatus.SUSPENDED) {
                  throw new BadRequestException('User is already suspended');
            }

            await this.prisma.user.update({
                  where: { id: userId },
                  data: { status: UserStatus.SUSPENDED, updatedById: adminId },
            });

            // Revoke all active tokens
            await this.tokenService.revokeAllUserSessions(
                  userId,
                  TokenRevocationReason.ADMIN_ACTION,
            );

            // Emit event for socket disconnect (event-driven cross-module)
            this.eventEmitter.emit('auth.security.revoked', {
                  userId,
                  reason: 'SECURITY_RISK',
            });

            this.logger.log(`User ${userId} suspended by admin ${adminId}`);
            return { success: true, message: 'User suspended and all sessions revoked' };
      }

      // ─── PATCH /admin/users/:id/activate ──────────────────────────────────

      async activateUser(userId: string) {
            const user = await this.prisma.user.findUnique({
                  where: { id: userId },
                  select: { id: true, status: true },
            });

            if (!user) throw new NotFoundException('User not found');
            if (user.status !== UserStatus.SUSPENDED) {
                  throw new BadRequestException('User is not suspended');
            }

            await this.prisma.user.update({
                  where: { id: userId },
                  data: { status: UserStatus.ACTIVE },
            });

            this.logger.log(`User ${userId} reactivated`);
            return { success: true, message: 'User reactivated' };
      }

      // ─── POST /admin/users/:id/force-logout ───────────────────────────────

      async forceLogoutUser(userId: string) {
            const user = await this.prisma.user.findUnique({
                  where: { id: userId },
                  select: { id: true },
            });

            if (!user) throw new NotFoundException('User not found');

            await this.tokenService.revokeAllUserSessions(
                  userId,
                  TokenRevocationReason.ADMIN_ACTION,
            );

            // Emit event for socket disconnect
            this.eventEmitter.emit('auth.security.revoked', {
                  userId,
                  reason: 'SECURITY_RISK',
            });

            this.logger.log(`Force logout all sessions for user ${userId}`);
            return { success: true, message: 'All sessions revoked' };
      }
}
