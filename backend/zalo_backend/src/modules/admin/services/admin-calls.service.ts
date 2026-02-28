import { Injectable } from '@nestjs/common';
import { CallStatus, CallType, ConversationType, Prisma } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { CallListQueryDto } from '../dto/call-list-query.dto';

/**
 * AdminCallsService
 *
 * Handles:
 * - GET /admin/calls              → paginated call history
 * - GET /admin/conversations      → conversation list (no content)
 */
@Injectable()
export class AdminCallsService {
      constructor(private readonly prisma: PrismaService) { }

      // ─── GET /admin/calls ─────────────────────────────────────────────────

      async getCalls(dto: CallListQueryDto) {
            const page = dto.page ?? 1;
            const limit = dto.limit ?? 20;
            const skip = (page - 1) * limit;

            const where: Prisma.CallHistoryWhereInput = {
                  deletedAt: null,
            };

            if (dto.type) {
                  where.callType = dto.type as CallType;
            }

            if (dto.status) {
                  where.status = dto.status as CallStatus;
            }

            if (dto.from || dto.to) {
                  where.startedAt = {};
                  if (dto.from) where.startedAt.gte = new Date(dto.from);
                  if (dto.to) where.startedAt.lte = new Date(dto.to);
            }

            const [data, total] = await Promise.all([
                  this.prisma.callHistory.findMany({
                        where,
                        select: {
                              id: true,
                              callType: true,
                              status: true,
                              duration: true,
                              participantCount: true,
                              startedAt: true,
                              endedAt: true,
                              initiator: {
                                    select: { id: true, displayName: true },
                              },
                              _count: { select: { participants: true } },
                        },
                        orderBy: { startedAt: 'desc' },
                        skip,
                        take: limit,
                  }),
                  this.prisma.callHistory.count({ where }),
            ]);

            return { data, total, page, limit };
      }

      // ─── GET /admin/conversations ─────────────────────────────────────────

      async getConversations(type?: string, page = 1, limit = 20) {
            page = Number(page) || 1;
            limit = Math.min(Number(limit) || 20, 100);
            const skip = (page - 1) * limit;

            const where: Prisma.ConversationWhereInput = {
                  deletedAt: null,
            };

            if (type) {
                  where.type = type as ConversationType;
            }

            const [data, total] = await Promise.all([
                  this.prisma.conversation.findMany({
                        where,
                        select: {
                              id: true,
                              type: true,
                              name: true,
                              avatarUrl: true,
                              lastMessageAt: true,
                              createdAt: true,
                              _count: { select: { members: true } },
                        },
                        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
                        skip,
                        take: limit,
                  }),
                  this.prisma.conversation.count({ where }),
            ]);

            return { data, total, page, limit };
      }
}
