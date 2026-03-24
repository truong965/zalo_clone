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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MemberStatus } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import {
  OUTBOUND_SOCKET_EVENT,
  ISocketEmitEvent,
} from '@common/events/outbound-socket.event';
import { InternalEventNames } from '@common/contracts/events/event-names';
import { ReminderTriggeredEvent } from '../events/reminder.events';

@Injectable()
export class ReminderSocketListener {
  private readonly logger = new Logger(ReminderSocketListener.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(InternalEventNames.REMINDER_TRIGGERED)
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
          isMuted: false,
        },
        select: { userId: true },
      });

      const memberIds = members.map((m) => m.userId);
      this.logger.log(
        `Pushing reminder ${event.reminderId} to ${memberIds.length} conversation members`,
      );

      const socketEvent: ISocketEmitEvent = {
        event: SocketEvents.REMINDER_TRIGGERED,
        data: payload,
        userIds: memberIds,
      };
      await this.eventEmitter.emitAsync(OUTBOUND_SOCKET_EVENT, socketEvent);
    } else {
      // Personal reminder (no conversation) → only notify creator
      this.logger.log(
        `Pushing personal reminder ${event.reminderId} to user ${event.userId}`,
      );
      const socketEvent: ISocketEmitEvent = {
        event: SocketEvents.REMINDER_TRIGGERED,
        data: payload,
        userId: event.userId,
      };
      await this.eventEmitter.emitAsync(OUTBOUND_SOCKET_EVENT, socketEvent);
    }
  }
}
