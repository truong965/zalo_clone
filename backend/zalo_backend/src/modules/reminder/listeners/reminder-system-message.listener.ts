/**
 * ReminderSystemMessageListener — Creates a SYSTEM message when a reminder is created.
 *
 * Event-driven: Listens to `reminder.created` from ReminderService
 * and creates a system message in the conversation (if conversationId is present).
 *
 * The system message is broadcast to all conversation members via the
 * `system-message.broadcast` event (handled by ConversationGateway).
 *
 * Zero coupling: Does not import ReminderService directly.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/database/prisma.service';
import { safeJSON } from 'src/common/utils/json.util';
import { ReminderCreatedEvent } from '../events/reminder.events';

@Injectable()
export class ReminderSystemMessageListener {
      private readonly logger = new Logger(ReminderSystemMessageListener.name);

      constructor(
            private readonly prisma: PrismaService,
            private readonly eventEmitter: EventEmitter2,
      ) { }

      @OnEvent(ReminderCreatedEvent.eventName)
      async onReminderCreated(event: ReminderCreatedEvent) {
            // Only create system message when reminder is linked to a conversation
            if (!event.conversationId) return;

            try {
                  // Lookup the creator's display name
                  const user = await this.prisma.user.findUnique({
                        where: { id: event.userId },
                        select: { displayName: true },
                  });
                  const actorName = user?.displayName ?? 'Một thành viên';

                  // Format the remind-at time for display
                  const remindAtDate = new Date(event.remindAt);
                  const timeStr = remindAtDate.toLocaleString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                  });

                  const sysMsg = await this.prisma.message.create({
                        data: {
                              conversationId: event.conversationId,
                              type: 'SYSTEM',
                              content: `${actorName} đã đặt nhắc hẹn: "${event.content}" vào lúc ${timeStr}`,
                              metadata: {
                                    action: 'REMINDER_CREATED',
                                    actorId: event.userId,
                                    reminderId: event.reminderId,
                                    remindAt: event.remindAt.toISOString(),
                              },
                        },
                  });

                  // Update conversation's lastMessageAt
                  await this.prisma.conversation.update({
                        where: { id: event.conversationId },
                        data: { lastMessageAt: sysMsg.createdAt },
                  });

                  // Broadcast to all conversation members via the shared pattern
                  this.eventEmitter.emit('system-message.broadcast', {
                        conversationId: event.conversationId,
                        message: safeJSON(sysMsg),
                        excludeUserIds: [],
                  });

                  this.logger.log(
                        `System message created for reminder ${event.reminderId} in conversation ${event.conversationId}`,
                  );
            } catch (error) {
                  this.logger.error(
                        `Failed to create system message for reminder ${event.reminderId}:`,
                        error,
                  );
                  // Non-critical: don't throw — reminder was already created successfully
            }
      }
}
