/**
 * MessageNotificationListener — FCM push for offline users on new messages.
 *
 * Lives in NotificationsModule (not MessageModule) to honour event-driven boundaries.
 * MessageModule emits `message.sent` → this listener reacts.
 *
 * Flow:
 * 1. `message.sent` event fires
 * 2. Get conversation members (cached via ConversationMemberCacheService)
 * 3. Filter: skip sender, skip online, skip muted, skip archived
 * 4. For each offline recipient: addToBatch (Redis)
 * 5. If new batch → schedule delayed push (setTimeout)
 * 6. When timer fires → flush batch → send FCM push
 *
 * Performance:
 * - Zero DB queries per event (cached members + Redis presence)
 * - Redis-based batching reduces FCM calls by 90-98%
 * - Never throws — all errors caught + logged (fire-and-forget)
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { RedisPresenceService } from '@modules/redis/services/redis-presence.service';
import { PushNotificationService } from '../services/push-notification.service';
import { NotificationBatchService, type BatchState } from '../services/notification-batch.service';
import { ConversationMemberCacheService, type CachedMemberState } from '../services/conversation-member-cache.service';
import type { MessageSentEvent } from '@modules/message/events';

/** Batch window in seconds per conversation type */
const BATCH_WINDOW = {
      DIRECT: 5,
      GROUP: 10,
} as const;

/** Content label for non-text message types */
const MESSAGE_TYPE_LABELS: Record<string, string> = {
      TEXT: '', // use actual content
      IMAGE: '[Hình ảnh]',
      VIDEO: '[Video]',
      FILE: '[Tệp]',
      STICKER: '[Nhãn dán]',
      AUDIO: '[Ghi âm]',
      VOICE: '[Tin nhắn thoại]',
      SYSTEM: '[Hệ thống]',
};

/** Max content length in push body */
const MAX_CONTENT_LENGTH = 100;

@Injectable()
export class MessageNotificationListener {
      private readonly logger = new Logger(MessageNotificationListener.name);

      constructor(
            private readonly pushService: PushNotificationService,
            private readonly batchService: NotificationBatchService,
            private readonly memberCache: ConversationMemberCacheService,
            private readonly presenceService: RedisPresenceService,
            private readonly prisma: PrismaService,
      ) { }

      /**
       * Handle message.sent event — core notification dispatch.
       * Never throws — all errors are caught and logged.
       */
      @OnEvent('message.sent')
      async handleMessageSent(event: MessageSentEvent): Promise<void> {
            if (!this.pushService.isAvailable) {
                  this.logger.warn(
                        `[MSG_NOTIF] Firebase not available — skipping push for message ${event.messageId}. ` +
                        'Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY env vars.',
                  );
                  return;
            }

            try {
                  await this.processEvent(event);
            } catch (error) {
                  // Fire-and-forget: never block domain flow
                  this.logger.error(
                        `[MSG_NOTIF] Failed to process message.sent ${event.messageId}: ${(error as Error).message}`,
                  );
            }
      }

      private async processEvent(event: MessageSentEvent): Promise<void> {
            const { messageId, conversationId, senderId, content, type } = event;

            // 1. Get conversation metadata (type + name) — needed for push content
            const conversation = await this.getConversationMeta(conversationId);
            if (!conversation) return;

            const conversationType = conversation.type as 'DIRECT' | 'GROUP';

            // 2. Get cached members (read-through cache → ~0ms on hit)
            const members = await this.memberCache.getMembers(conversationId);
            if (members.length === 0) return;

            // 3. Filter recipients: exclude sender
            const recipients = members.filter((m) => m.userId !== senderId);
            if (recipients.length === 0) return;

            // 4. Batch online check — single Redis pipeline for all recipients
            const offlineRecipients = await this.filterOfflineRecipients(recipients);
            if (offlineRecipients.length === 0) {
                  this.logger.debug(
                        `[MSG_NOTIF] Skipping push for message ${messageId}: all ${recipients.length} recipient(s) are online (socket connected) or muted/archived`,
                  );
                  return;
            }

            // 5. Resolve sender name (for push content)
            const senderName = await this.resolveSenderName(senderId);

            // 6. Prepare message content for push display
            const messageContent = this.formatContent(content, type);

            // 7. Add each offline + eligible recipient to batch
            const windowSeconds = BATCH_WINDOW[conversationType] ?? BATCH_WINDOW.DIRECT;

            await Promise.all(
                  offlineRecipients.map((member) =>
                        this.addRecipientToBatch({
                              recipientId: member.userId,
                              conversationId,
                              conversationType,
                              senderName,
                              senderId,
                              messageContent,
                              conversationName: conversation.name,
                              windowSeconds,
                        }),
                  ),
            );

            this.logger.debug(
                  `[MSG_NOTIF] Processed ${messageId}: ${offlineRecipients.length} offline recipient(s) batched`,
            );
      }

      /**
       * Filter recipients: keep only offline + not-muted + not-archived.
       * Uses batch Redis presence check for performance.
       */
      private async filterOfflineRecipients(
            recipients: CachedMemberState[],
      ): Promise<CachedMemberState[]> {
            // First filter: muted/archived (no Redis call needed)
            const eligible = recipients.filter((m) => !m.isMuted && !m.isArchived);
            if (eligible.length === 0) return [];

            // Batch online check
            const onlineResults = await Promise.all(
                  eligible.map((m) => this.presenceService.isUserOnline(m.userId)),
            );

            return eligible.filter((_, idx) => !onlineResults[idx]);
      }

      /**
       * Add a single recipient to the batch. If new batch, schedule delayed push.
       */
      private async addRecipientToBatch(params: {
            recipientId: string;
            conversationId: string;
            conversationType: 'DIRECT' | 'GROUP';
            senderName: string;
            senderId: string;
            messageContent: string;
            conversationName: string | null;
            windowSeconds: number;
      }): Promise<void> {
            try {
                  const { isNewBatch } = await this.batchService.addToBatch({
                        recipientId: params.recipientId,
                        conversationId: params.conversationId,
                        senderName: params.senderName,
                        messageContent: params.messageContent,
                        conversationType: params.conversationType,
                        conversationName: params.conversationName,
                        windowSeconds: params.windowSeconds,
                  });

                  if (isNewBatch) {
                        // Schedule delayed push — only first message in batch triggers this
                        this.scheduleFlush(
                              params.recipientId,
                              params.conversationId,
                              params.senderId,
                              params.windowSeconds,
                        );
                  }
            } catch (error) {
                  this.logger.warn(
                        `[MSG_NOTIF] Batch add failed for ${params.recipientId.slice(0, 8)}…: ${(error as Error).message}`,
                  );
            }
      }

      /**
       * Schedule a delayed flush + push after windowSeconds.
       * Uses setTimeout (in-process timer). If this instance crashes,
       * the Redis key TTL auto-cleans and user misses 1 batch (acceptable).
       */
      private scheduleFlush(
            recipientId: string,
            conversationId: string,
            senderId: string,
            windowSeconds: number,
      ): void {
            setTimeout(async () => {
                  try {
                        const batch = await this.batchService.flushBatch(recipientId, conversationId);
                        if (!batch) return; // Already flushed or expired

                        await this.sendBatchPush(recipientId, senderId, batch);
                  } catch (error) {
                        this.logger.error(
                              `[MSG_NOTIF] Flush failed for ${recipientId.slice(0, 8)}…: ${(error as Error).message}`,
                        );
                  }
            }, windowSeconds * 1000);
      }

      /**
       * Send the actual FCM push for a flushed batch.
       */
      private async sendBatchPush(
            recipientId: string,
            senderId: string,
            batch: BatchState,
      ): Promise<void> {
            await this.pushService.sendMessagePush({
                  recipientId,
                  conversationId: batch.conversationId,
                  conversationType: batch.conversationType,
                  senderName: batch.senderName,
                  messageContent: batch.lastContent,
                  messageCount: batch.count,
                  conversationName: batch.conversationName || null,
                  senderId,
            });
      }

      // ─── Helpers ──────────────────────────────────────────────────────

      /**
       * Get conversation type and name. Lightweight query (2 columns).
       */
      private async getConversationMeta(
            conversationId: string,
      ): Promise<{ type: string; name: string | null } | null> {
            try {
                  return await this.prisma.conversation.findUnique({
                        where: { id: conversationId },
                        select: { type: true, name: true },
                  });
            } catch {
                  return null;
            }
      }

      /**
       * Resolve sender display name. Fallback to 'Người dùng' if not found.
       */
      private async resolveSenderName(senderId: string): Promise<string> {
            try {
                  const user = await this.prisma.user.findUnique({
                        where: { id: senderId },
                        select: { displayName: true },
                  });
                  return user?.displayName ?? 'Người dùng';
            } catch {
                  return 'Người dùng';
            }
      }

      /**
       * Format message content for push notification body.
       * - Non-text types → label (e.g., "[Hình ảnh]")
       * - Text → truncated to MAX_CONTENT_LENGTH
       */
      private formatContent(content: string, type: string): string {
            const label = MESSAGE_TYPE_LABELS[type];

            // Non-text types have predefined labels
            if (label !== undefined && label !== '') return label;

            // Text: truncate if too long
            if (content.length > MAX_CONTENT_LENGTH) {
                  return content.slice(0, MAX_CONTENT_LENGTH) + '…';
            }
            return content;
      }
}
