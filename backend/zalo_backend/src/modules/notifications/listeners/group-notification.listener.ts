/**
 * GroupNotificationListener — FCM push for offline users on group conversation events.
 *
 * Lives in NotificationsModule (not ConversationModule) to honour event-driven boundaries.
 * ConversationModule emits domain events → this listener reacts with push notifications.
 *
 * Events handled:
 * - `conversation.created`          → push to all members except creator (GROUP only)
 * - `conversation.member.added`     → push to new members + existing members
 * - `conversation.member.left`      → push to remaining members (voluntary) or kicked member (forced)
 * - `conversation.member.promoted`  → push to promoted member
 * - `conversation.member.demoted`   → push to demoted member
 *
 * Business rules:
 * - Do not skip by online socket presence: online tabs may still be hidden/unfocused.
 *   Service Worker decides whether to surface OS notification.
 * - Skip if recipient has muted/archived this conversation (except critical events)
 * - Critical events (kicked/removed) always push regardless of mute/archive
 * - No batching — group admin actions are low-frequency
 * - Fire-and-forget — never block domain flow
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { PushNotificationService, GroupEventPushParams } from '../services/push-notification.service';
import { ConversationMemberCacheService, CachedMemberState } from '../services/conversation-member-cache.service';
import type {
      ConversationCreatedEvent,
      ConversationMemberAddedEvent,
      ConversationMemberLeftEvent,
      ConversationMemberPromotedEvent,
      ConversationMemberDemotedEvent,
} from '@modules/conversation/events';

// ─── Group event subtypes ────────────────────────────────────────────
const GROUP_SUBTYPE = {
      CREATED: 'CREATED',
      MEMBER_ADDED: 'MEMBER_ADDED',
      MEMBER_LEFT: 'MEMBER_LEFT',
      MEMBER_REMOVED: 'MEMBER_REMOVED',
      MEMBER_PROMOTED: 'MEMBER_PROMOTED',
      MEMBER_DEMOTED: 'MEMBER_DEMOTED',
} as const;

@Injectable()
export class GroupNotificationListener {
      private readonly logger = new Logger(GroupNotificationListener.name);

      constructor(
            private readonly pushService: PushNotificationService,
            private readonly prisma: PrismaService,
            private readonly memberCache: ConversationMemberCacheService,
      ) { }

      // ─────────────────────────────────────────────────────────────────────
      // conversation.created → push to all members (GROUP only)
      // ─────────────────────────────────────────────────────────────────────

      @OnEvent('conversation.created', { async: true })
      async handleConversationCreated(event: ConversationCreatedEvent): Promise<void> {
            // Only handle GROUP conversations
            if (event.type !== 'GROUP') return;
            if (!this.pushService.isAvailable) return;

            try {
                  await this.processGroupCreated(event);
            } catch (error) {
                  this.logger.error(
                        `[GROUP_NOTIF] Failed to process conversation.created: ${(error as Error).message}`,
                  );
            }
      }

      private async processGroupCreated(event: ConversationCreatedEvent): Promise<void> {
            const { conversationId, createdBy, participantIds, name } = event;
            const groupName = name ?? 'Nhóm mới';

            // Resolve creator profile for push content
            const creatorProfile = await this.resolveUserProfile(createdBy);

            // Send to all participants except creator
            const recipientIds = participantIds.filter((id) => id !== createdBy);
            const pushRecipients = recipientIds;

            const pushPromises = pushRecipients.map((recipientId) =>
                  this.safeSendGroupPush({
                        recipientId,
                        conversationId,
                        subtype: GROUP_SUBTYPE.CREATED,
                        groupName,
                        title: 'Nhóm mới',
                        body: `${creatorProfile.displayName} đã tạo nhóm "${groupName}"`,
                  }),
            );

            await Promise.allSettled(pushPromises);
      }

      // ─────────────────────────────────────────────────────────────────────
      // conversation.member.added → push to new + existing members
      // ─────────────────────────────────────────────────────────────────────

      @OnEvent('conversation.member.added', { async: true })
      async handleMemberAdded(event: ConversationMemberAddedEvent): Promise<void> {
            if (!this.pushService.isAvailable) return;

            try {
                  await this.processMemberAdded(event);
            } catch (error) {
                  this.logger.error(
                        `[GROUP_NOTIF] Failed to process conversation.member.added: ${(error as Error).message}`,
                  );
            }
      }

      private async processMemberAdded(event: ConversationMemberAddedEvent): Promise<void> {
            const { conversationId, addedBy, memberIds } = event;

            // Resolve in parallel: group name, adder profile, member states
            const [groupName, adderProfile, memberStates] = await Promise.all([
                  this.resolveGroupName(conversationId),
                  this.resolveUserProfile(addedBy),
                  this.memberCache.getMembers(conversationId),
            ]);

            const newMemberSet = new Set(memberIds);
            const pushPromises: Promise<void>[] = [];

            // 1. Push to new members: "Bạn đã được thêm vào nhóm"
            for (const recipientId of memberIds) {
                  pushPromises.push(
                        this.safeSendGroupPush({
                              recipientId,
                              conversationId,
                              subtype: GROUP_SUBTYPE.MEMBER_ADDED,
                              groupName,
                              title: 'Nhóm mới',
                              body: `Bạn đã được thêm vào "${groupName}"`,
                        }),
                  );
            }

            // 2. Push to existing (non-muted, non-archived) members
            const existingRecipientIds = memberStates
                  .filter((m) => !newMemberSet.has(m.userId) && m.userId !== addedBy && !m.isMuted && !m.isArchived)
                  .map((m) => m.userId);
            const addedCount = memberIds.length;
            const memberLabel = addedCount === 1 ? 'thành viên' : `${addedCount} thành viên`;

            for (const recipientId of existingRecipientIds) {
                  pushPromises.push(
                        this.safeSendGroupPush({
                              recipientId,
                              conversationId,
                              subtype: GROUP_SUBTYPE.MEMBER_ADDED,
                              groupName,
                              title: 'Thành viên mới',
                              body: `${adderProfile.displayName} đã thêm ${memberLabel}`,
                        }),
                  );
            }

            await Promise.allSettled(pushPromises);
      }

      // ─────────────────────────────────────────────────────────────────────
      // conversation.member.left → push to remaining members or kicked member
      // ─────────────────────────────────────────────────────────────────────

      @OnEvent('conversation.member.left', { async: true })
      async handleMemberLeft(event: ConversationMemberLeftEvent): Promise<void> {
            if (!this.pushService.isAvailable) return;

            try {
                  await this.processMemberLeft(event);
            } catch (error) {
                  this.logger.error(
                        `[GROUP_NOTIF] Failed to process conversation.member.left: ${(error as Error).message}`,
                  );
            }
      }

      private async processMemberLeft(event: ConversationMemberLeftEvent): Promise<void> {
            const { conversationId, memberId, kickedBy } = event;
            const isKicked = !!kickedBy;

            const [groupName, memberProfile] = await Promise.all([
                  this.resolveGroupName(conversationId),
                  this.resolveUserProfile(memberId),
            ]);

            const pushPromises: Promise<void>[] = [];

            if (isKicked) {
                  // Critical push to kicked member — always send regardless of mute/archive
                  pushPromises.push(
                        this.safeSendGroupPush({
                              recipientId: memberId,
                              conversationId,
                              subtype: GROUP_SUBTYPE.MEMBER_REMOVED,
                              groupName,
                              title: 'Đã bị xóa khỏi nhóm',
                              body: `Bạn đã bị xóa khỏi nhóm "${groupName}"`,
                        }),
                  );
            }

            // Notify remaining members (with mute/archive gate)
            const memberStates = await this.memberCache.getMembers(conversationId);
            const actorId = kickedBy ?? memberId; // Skip the kicker or the leaver
            const remainingIds = memberStates
                  .filter((m) => m.userId !== memberId && m.userId !== actorId && !m.isMuted && !m.isArchived)
                  .map((m) => m.userId);

            const body = isKicked
                  ? `${memberProfile.displayName} đã bị xóa khỏi nhóm`
                  : `${memberProfile.displayName} đã rời khỏi nhóm`;

            for (const recipientId of remainingIds) {
                  pushPromises.push(
                        this.safeSendGroupPush({
                              recipientId,
                              conversationId,
                              subtype: isKicked ? GROUP_SUBTYPE.MEMBER_REMOVED : GROUP_SUBTYPE.MEMBER_LEFT,
                              groupName,
                              title: isKicked ? 'Đã xóa thành viên' : 'Rời nhóm',
                              body,
                        }),
                  );
            }

            await Promise.allSettled(pushPromises);
      }

      // ─────────────────────────────────────────────────────────────────────
      // conversation.member.promoted → push to promoted member
      // ─────────────────────────────────────────────────────────────────────

      @OnEvent('conversation.member.promoted', { async: true })
      async handleMemberPromoted(event: ConversationMemberPromotedEvent): Promise<void> {
            if (!this.pushService.isAvailable) return;

            try {
                  await this.processMemberPromoted(event);
            } catch (error) {
                  this.logger.error(
                        `[GROUP_NOTIF] Failed to process conversation.member.promoted: ${(error as Error).message}`,
                  );
            }
      }

      private async processMemberPromoted(event: ConversationMemberPromotedEvent): Promise<void> {
            const { conversationId, memberId } = event;

            const groupName = await this.resolveGroupName(conversationId);

            await this.safeSendGroupPush({
                  recipientId: memberId,
                  conversationId,
                  subtype: GROUP_SUBTYPE.MEMBER_PROMOTED,
                  groupName,
                  title: 'Quản trị viên',
                  body: `Bạn đã trở thành quản trị viên nhóm "${groupName}"`,
            });
      }

      // ─────────────────────────────────────────────────────────────────────
      // conversation.member.demoted → push to demoted member
      // ─────────────────────────────────────────────────────────────────────

      @OnEvent('conversation.member.demoted', { async: true })
      async handleMemberDemoted(event: ConversationMemberDemotedEvent): Promise<void> {
            if (!this.pushService.isAvailable) return;

            try {
                  await this.processMemberDemoted(event);
            } catch (error) {
                  this.logger.error(
                        `[GROUP_NOTIF] Failed to process conversation.member.demoted: ${(error as Error).message}`,
                  );
            }
      }

      private async processMemberDemoted(event: ConversationMemberDemotedEvent): Promise<void> {
            const { conversationId, memberId } = event;

            const groupName = await this.resolveGroupName(conversationId);

            await this.safeSendGroupPush({
                  recipientId: memberId,
                  conversationId,
                  subtype: GROUP_SUBTYPE.MEMBER_DEMOTED,
                  groupName,
                  title: 'Thay đổi vai trò',
                  body: `Bạn không còn là quản trị viên nhóm "${groupName}"`,
            });
      }

      // ─── Helpers ──────────────────────────────────────────────────────

      /**
       * Safe push wrapper: catches errors per-recipient so one failure doesn't
       * block other recipients in batch operations.
       */
      private async safeSendGroupPush(params: GroupEventPushParams): Promise<void> {
            try {
                  await this.pushService.sendGroupEventPush(params);
            } catch (error) {
                  this.logger.warn(
                        `[GROUP_NOTIF] Push failed for user=${params.recipientId.slice(0, 8)}… conv=${params.conversationId.slice(0, 8)}… subtype=${params.subtype}: ${(error as Error).message}`,
                  );
            }
      }

      /**
       * Resolve group conversation name. Lightweight select (1 column).
       * Fallback to 'Nhóm chat' if not found.
       */
      private async resolveGroupName(conversationId: string): Promise<string> {
            try {
                  const conversation = await this.prisma.conversation.findUnique({
                        where: { id: conversationId },
                        select: { name: true },
                  });
                  return conversation?.name ?? 'Nhóm chat';
            } catch {
                  return 'Nhóm chat';
            }
      }

      /**
       * Resolve user display name. Lightweight select (1 column).
       * Fallback to 'Người dùng' if user not found.
       */
      private async resolveUserProfile(userId: string): Promise<{ displayName: string }> {
            try {
                  const user = await this.prisma.user.findUnique({
                        where: { id: userId },
                        select: { displayName: true },
                  });
                  return { displayName: user?.displayName ?? 'Người dùng' };
            } catch {
                  return { displayName: 'Người dùng' };
            }
      }
}
