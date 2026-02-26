/**
 * ReminderService — CRUD operations for reminders.
 *
 * Business rules:
 * - Max 50 active reminders per user
 * - remindAt must be in the future (>= 1 minute from now)
 * - conversationId / messageId are optional context links
 * - Emits domain events (event-driven) → listeners handle system messages
 * - Scheduling handled by ReminderSchedulerService (cron-based DB polling)
 */

import {
      Injectable,
      Logger,
      BadRequestException,
      NotFoundException,
      ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/database/prisma.service';
import {
      MAX_ACTIVE_REMINDERS,
      MIN_REMINDER_DELAY_MS,
      MAX_REMINDER_DELAY_MS,
} from '../constants/reminder.constants';
import {
      ReminderCreatedEvent,
      ReminderDeletedEvent,
} from '../events/reminder.events';
import type { CreateReminderDto } from '../dto/create-reminder.dto';
import type { UpdateReminderDto } from '../dto/update-reminder.dto';

@Injectable()
export class ReminderService {
      private readonly logger = new Logger(ReminderService.name);

      constructor(
            private readonly prisma: PrismaService,
            private readonly eventEmitter: EventEmitter2,
      ) { }

      /**
       * Create a new reminder.
       */
      async create(userId: string, dto: CreateReminderDto) {
            const remindAt = new Date(dto.remindAt);
            this.validateRemindAt(remindAt);

            // Check active reminder limit
            const activeCount = await this.prisma.reminder.count({
                  where: { userId, isCompleted: false },
            });
            if (activeCount >= MAX_ACTIVE_REMINDERS) {
                  throw new BadRequestException(
                        `Bạn đã đạt giới hạn ${MAX_ACTIVE_REMINDERS} nhắc hẹn đang hoạt động.`,
                  );
            }

            // Validate conversation membership if conversationId provided
            if (dto.conversationId) {
                  const member = await this.prisma.conversationMember.findUnique({
                        where: {
                              conversationId_userId: {
                                    conversationId: dto.conversationId,
                                    userId,
                              },
                        },
                  });
                  if (!member || member.status !== 'ACTIVE') {
                        throw new ForbiddenException('Bạn không phải thành viên cuộc trò chuyện này.');
                  }
            }

            // Validate message existence if messageId provided
            if (dto.messageId) {
                  const message = await this.prisma.message.findUnique({
                        where: { id: BigInt(dto.messageId) },
                        select: { id: true, conversationId: true, deletedAt: true },
                  });
                  if (!message || message.deletedAt) {
                        throw new BadRequestException('Tin nhắn không tồn tại hoặc đã bị xóa.');
                  }
                  // auto-fill conversationId from message if not provided
                  if (!dto.conversationId) {
                        dto.conversationId = message.conversationId;
                  }
            }

            const reminder = await this.prisma.reminder.create({
                  data: {
                        userId,
                        conversationId: dto.conversationId ?? null,
                        messageId: dto.messageId ? BigInt(dto.messageId) : null,
                        content: dto.content,
                        remindAt,
                  },
            });

            this.logger.log(`Reminder ${reminder.id} created for user ${userId} at ${remindAt.toISOString()}`);

            // Emit event → listeners create system message, etc.
            this.eventEmitter.emit(
                  ReminderCreatedEvent.eventName,
                  new ReminderCreatedEvent(
                        reminder.id,
                        userId,
                        reminder.conversationId,
                        reminder.messageId,
                        reminder.content,
                        remindAt,
                  ),
            );

            return this.serializeReminder(reminder);
      }

      /**
       * Get all reminders for a user (active only by default, or all).
       */
      async findAll(userId: string, includeCompleted = false) {
            const reminders = await this.prisma.reminder.findMany({
                  where: {
                        userId,
                        ...(includeCompleted ? {} : { isCompleted: false }),
                  },
                  orderBy: { remindAt: 'asc' },
                  include: {
                        conversation: { select: { id: true, name: true, type: true } },
                        message: { select: { id: true, content: true, type: true } },
                  },
            });

            return reminders.map((r) => this.serializeReminderWithRelations(r));
      }

      /**
       * Get a single reminder by ID (ownership check).
       */
      async findOne(userId: string, reminderId: string) {
            const reminder = await this.prisma.reminder.findUnique({
                  where: { id: reminderId },
                  include: {
                        conversation: { select: { id: true, name: true, type: true } },
                        message: { select: { id: true, content: true, type: true } },
                  },
            });
            if (!reminder) throw new NotFoundException('Nhắc hẹn không tồn tại.');
            if (reminder.userId !== userId) throw new ForbiddenException('Bạn không có quyền xem nhắc hẹn này.');
            return this.serializeReminderWithRelations(reminder);
      }

      /**
       * Update a reminder (content, remindAt, or mark completed).
       */
      async update(userId: string, reminderId: string, dto: UpdateReminderDto) {
            const existing = await this.prisma.reminder.findUnique({
                  where: { id: reminderId },
            });
            if (!existing) throw new NotFoundException('Nhắc hẹn không tồn tại.');
            if (existing.userId !== userId) throw new ForbiddenException('Bạn không có quyền chỉnh sửa nhắc hẹn này.');

            // Build update data
            const data: Record<string, unknown> = {};

            if (dto.content !== undefined) data.content = dto.content;

            if (dto.remindAt !== undefined) {
                  const newRemindAt = new Date(dto.remindAt);
                  this.validateRemindAt(newRemindAt);
                  data.remindAt = newRemindAt;
            }

            if (dto.isCompleted !== undefined) {
                  data.isCompleted = dto.isCompleted;
                  data.completedAt = dto.isCompleted ? new Date() : null;
                  // If marking as completed but not yet triggered, also trigger
                  if (dto.isCompleted && !existing.isTriggered) {
                        data.isTriggered = true;
                        data.triggeredAt = new Date();
                  }
            }

            const updated = await this.prisma.reminder.update({
                  where: { id: reminderId },
                  data,
            });

            // If remindAt changed and not completed → reset triggered state (will be re-picked by cron)
            if (dto.remindAt !== undefined && !updated.isCompleted) {
                  // If it was already triggered, reset triggered state for the new time
                  if (existing.isTriggered) {
                        await this.prisma.reminder.update({
                              where: { id: reminderId },
                              data: { isTriggered: false, triggeredAt: null },
                        });
                  }
            }

            this.logger.log(`Reminder ${reminderId} updated by user ${userId}`);
            return this.serializeReminder(updated);
      }

      /**
       * Delete a reminder.
       */
      async remove(userId: string, reminderId: string) {
            const existing = await this.prisma.reminder.findUnique({
                  where: { id: reminderId },
            });
            if (!existing) throw new NotFoundException('Nhắc hẹn không tồn tại.');
            if (existing.userId !== userId) throw new ForbiddenException('Bạn không có quyền xóa nhắc hẹn này.');

            await this.prisma.reminder.delete({ where: { id: reminderId } });

            this.eventEmitter.emit(
                  ReminderDeletedEvent.eventName,
                  new ReminderDeletedEvent(reminderId, userId),
            );

            this.logger.log(`Reminder ${reminderId} deleted by user ${userId}`);
            return { success: true };
      }

      /**
       * Get all active reminders for a conversation.
       * Returns reminders from ALL members, visible to any active member.
       * Used in the info sidebar so non-creator members can see shared reminders.
       */
      async findByConversation(userId: string, conversationId: string) {
            // Verify the requester is an active member
            const member = await this.prisma.conversationMember.findUnique({
                  where: {
                        conversationId_userId: { conversationId, userId },
                  },
            });
            if (!member || member.status !== 'ACTIVE') {
                  throw new ForbiddenException('Bạn không phải thành viên cuộc trò chuyện này.');
            }

            const reminders = await this.prisma.reminder.findMany({
                  where: {
                        conversationId,
                        isCompleted: false,
                  },
                  orderBy: { remindAt: 'asc' },
                  include: {
                        conversation: { select: { id: true, name: true, type: true } },
                        message: { select: { id: true, content: true, type: true } },
                  },
            });

            return reminders.map((r) => this.serializeReminderWithRelations(r));
      }

      /**
       * Find all triggered-but-unacknowledged reminders for a user.
       * Used for offline delivery on reconnect.
       */
      async findUndelivered(userId: string) {
            const reminders = await this.prisma.reminder.findMany({
                  where: {
                        userId,
                        isTriggered: true,
                        isCompleted: false,
                  },
                  orderBy: { triggeredAt: 'desc' },
                  include: {
                        conversation: { select: { id: true, name: true, type: true } },
                        message: { select: { id: true, content: true, type: true } },
                  },
            });

            return reminders.map((r) => this.serializeReminderWithRelations(r));
      }

      // ── Private helpers ──────────────────────────────────────────────────────

      private validateRemindAt(remindAt: Date) {
            const now = Date.now();
            const delay = remindAt.getTime() - now;

            if (delay < MIN_REMINDER_DELAY_MS) {
                  throw new BadRequestException('Thời gian nhắc hẹn phải ít nhất 1 phút trong tương lai.');
            }
            if (delay > MAX_REMINDER_DELAY_MS) {
                  throw new BadRequestException('Thời gian nhắc hẹn không được quá 1 năm.');
            }
      }

      private serializeReminder(r: {
            id: string;
            userId: string;
            conversationId: string | null;
            messageId: bigint | null;
            content: string;
            remindAt: Date;
            isTriggered: boolean;
            triggeredAt: Date | null;
            isCompleted: boolean;
            createdAt: Date;
            completedAt: Date | null;
      }) {
            return {
                  id: r.id,
                  userId: r.userId,
                  conversationId: r.conversationId,
                  messageId: r.messageId ? r.messageId.toString() : null,
                  content: r.content,
                  remindAt: r.remindAt.toISOString(),
                  isTriggered: r.isTriggered,
                  triggeredAt: r.triggeredAt?.toISOString() ?? null,
                  isCompleted: r.isCompleted,
                  createdAt: r.createdAt.toISOString(),
                  completedAt: r.completedAt?.toISOString() ?? null,
            };
      }

      private serializeReminderWithRelations(r: {
            id: string;
            userId: string;
            conversationId: string | null;
            messageId: bigint | null;
            content: string;
            remindAt: Date;
            isTriggered: boolean;
            triggeredAt: Date | null;
            isCompleted: boolean;
            createdAt: Date;
            completedAt: Date | null;
            conversation?: { id: string; name: string | null; type: string } | null;
            message?: { id: bigint; content: string | null; type: string } | null;
      }) {
            return {
                  ...this.serializeReminder(r),
                  conversation: r.conversation ?? null,
                  message: r.message
                        ? { id: r.message.id.toString(), content: r.message.content, type: r.message.type }
                        : null,
            };
      }
}
