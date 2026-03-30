/**
 * ReminderNotificationListener — FCM push for triggered reminders.
 *
 * Lives in NotificationsModule (not ReminderModule) to honour event-driven boundaries.
 * ReminderModule emits `reminder.triggered` → this listener reacts with push notifications.
 *
 * Events handled:
 * - `reminder.triggered` → push to creator and (optionally) all conversation members
 *
 * Business rules:
 * - Do not skip by online socket presence.
 * - For conversation reminders, skip if recipient has muted/archived the conversation.
 * - For personal reminders, always send to the creator.
 * - Fire-and-forget — never block domain flow.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MemberStatus } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { InternalEventNames } from '@common/contracts/events/event-names';
import { PushNotificationService } from '../services/push-notification.service';
import {
  ConversationMemberCacheService,
  CachedMemberState,
} from '../services/conversation-member-cache.service';
import {
  ReminderTriggeredEvent,
  ReminderCreatedEvent,
  ReminderUpdatedEvent,
  ReminderDeletedEvent,
} from '@modules/reminder/events/reminder.events';

@Injectable()
export class ReminderNotificationListener {
  private readonly logger = new Logger(ReminderNotificationListener.name);

  constructor(
    private readonly pushService: PushNotificationService,
    private readonly prisma: PrismaService,
    private readonly memberCache: ConversationMemberCacheService,
  ) {}

  @OnEvent(InternalEventNames.REMINDER_TRIGGERED, { async: true })
  async handleReminderTriggered(event: ReminderTriggeredEvent): Promise<void> {
    if (!this.pushService.isAvailable) return;

    try {
      await this.processReminderTriggered(event);
    } catch (error) {
      this.logger.error(
        `[REMINDER_NOTIF] Failed to process reminder.triggered: ${(error as Error).message}`,
      );
    }
  }

  @OnEvent(InternalEventNames.REMINDER_CREATED, { async: true })
  async handleReminderCreated(event: ReminderCreatedEvent): Promise<void> {
    if (!this.pushService.isAvailable) return;
    try {
      await this.sendSyncPush(event.userId, 'REMINDER_CREATED', {
        reminderId: event.reminderId,
        remindAt: event.remindAt.toISOString(),
        content: event.content,
        conversationId: event.conversationId,
      });
    } catch {
      /* silent */
    }
  }

  @OnEvent(InternalEventNames.REMINDER_UPDATED, { async: true })
  async handleReminderUpdated(event: ReminderUpdatedEvent): Promise<void> {
    if (!this.pushService.isAvailable) return;
    try {
      await this.sendSyncPush(event.userId, 'REMINDER_UPDATED', {
        reminderId: event.reminderId,
        remindAt: event.remindAt.toISOString(),
        content: event.content,
        conversationId: event.conversationId,
        isCompleted: event.isCompleted,
      });
    } catch {
      /* silent */
    }
  }

  @OnEvent(InternalEventNames.REMINDER_DELETED, { async: true })
  async handleReminderDeleted(event: ReminderDeletedEvent): Promise<void> {
    if (!this.pushService.isAvailable) return;
    try {
      await this.sendSyncPush(event.userId, 'REMINDER_DELETED', {
        reminderId: event.reminderId,
      });
    } catch {
      /* silent */
    }
  }

  private async sendSyncPush(
    userId: string,
    type: string,
    data: Record<string, any>,
  ): Promise<void> {
    // For personal sync events, we use a lightweight data-only push.
    // This tells the mobile app to refresh its local scheduling.
    await this.pushService.sendPushToUser(userId, null as any, {
      ...data,
      type,
      timestamp: new Date().toISOString(),
    });
  }

  private async processReminderTriggered(
    event: ReminderTriggeredEvent,
  ): Promise<void> {
    const { reminderId, userId, conversationId, content } = event;

    // 1. Determine recipients
    let recipients: string[] = [];

    if (conversationId) {
      // Conversation reminder → all active members
      const memberStates = await this.memberCache.getMembers(conversationId);
      recipients = memberStates
        .filter((m) => !m.isMuted && !m.isArchived)
        .map((m) => m.userId);
    } else {
      // Personal reminder → only the creator
      recipients = [userId];
    }

    if (recipients.length === 0) return;

    // 2. Send push to each recipient
    const title = '🔔 Nhắc hẹn';
    const body = content || 'Bạn có một nhắc hẹn';

    const pushPromises = recipients.map((recipientId) =>
      this.pushService.sendReminderPush({
        recipientId,
        reminderId,
        content,
        conversationId,
        creatorId: userId,
        title,
        body,
      }),
    );

    await Promise.allSettled(pushPromises);

    this.logger.debug(
      `[REMINDER_NOTIF] Processed reminder ${reminderId}: ${recipients.length} push(es) queued`,
    );
  }
}
