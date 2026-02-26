/**
 * ReminderSocketListener — Sends realtime notifications when reminders trigger.
 *
 * Event-driven: Listens to `reminder.triggered` from ReminderSchedulerService
 * and emits Socket.IO events to:
 * - All active conversation members (if reminder has conversationId)
 * - Only the creator (if no conversationId — personal reminder)
 *
 * Zero coupling: Does not import ReminderService or ReminderSchedulerService.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MemberStatus } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { SocketGateway } from 'src/socket/socket.gateway';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { ReminderTriggeredEvent } from '../events/reminder.events';

@Injectable()
export class ReminderSocketListener {
      private readonly logger = new Logger(ReminderSocketListener.name);

      constructor(
            private readonly socketGateway: SocketGateway,
            private readonly prisma: PrismaService,
      ) { }

      @OnEvent(ReminderTriggeredEvent.eventName)
      async onReminderTriggered(event: ReminderTriggeredEvent) {
            const payload = {
                  reminderId: event.reminderId,
                  conversationId: event.conversationId,
                  messageId: event.messageId,
                  content: event.content,
                  creatorId: event.userId, // lets frontend know who created the reminder
            };

            // If reminder belongs to a conversation → notify ALL active members
            if (event.conversationId) {
                  const members = await this.prisma.conversationMember.findMany({
                        where: {
                              conversationId: event.conversationId,
                              status: MemberStatus.ACTIVE,
                        },
                        select: { userId: true },
                  });

                  const memberIds = members.map((m) => m.userId);
                  this.logger.log(
                        `Pushing reminder ${event.reminderId} to ${memberIds.length} conversation members`,
                  );

                  await this.socketGateway.emitToUsers(memberIds, SocketEvents.REMINDER_TRIGGERED, payload);
            } else {
                  // Personal reminder (no conversation) → only notify creator
                  this.logger.log(`Pushing personal reminder ${event.reminderId} to user ${event.userId}`);
                  await this.socketGateway.emitToUser(event.userId, SocketEvents.REMINDER_TRIGGERED, payload);
            }
      }
}
