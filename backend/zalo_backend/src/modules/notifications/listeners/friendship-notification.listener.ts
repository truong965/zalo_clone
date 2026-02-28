/**
 * FriendshipNotificationListener — FCM push for offline users on friendship events.
 *
 * Lives in NotificationsModule (not FriendshipModule) to honour event-driven boundaries.
 * FriendshipModule emits events → this listener reacts with push notifications.
 *
 * Events handled:
 * - `friendship.request.sent`  → push to target user (the one receiving the request)
 * - `friendship.accepted`      → push to requester (the one who sent the request)
 *
 * No batching needed — friendship events are low-frequency and each one is important.
 *
 * Business rules:
 * - Skip if recipient is online (socket event already delivered)
 * - No mute/archive gate (friendship is 1:1 event, not conversation-scoped)
 * - Tag push by requestId/friendshipId for potential replacement
 * - Fire-and-forget — never block domain flow
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { RedisPresenceService } from '@modules/redis/services/redis-presence.service';
import { PushNotificationService } from '../services/push-notification.service';
import type { FriendRequestSentEvent, FriendRequestAcceptedEvent } from '@modules/friendship/events/friendship.events';

@Injectable()
export class FriendshipNotificationListener {
      private readonly logger = new Logger(FriendshipNotificationListener.name);

      constructor(
            private readonly pushService: PushNotificationService,
            private readonly presenceService: RedisPresenceService,
            private readonly prisma: PrismaService,
      ) { }

      // ─────────────────────────────────────────────────────────────────────
      // Friend request sent → push to target user
      // ─────────────────────────────────────────────────────────────────────

      @OnEvent('friendship.request.sent')
      async handleFriendRequestSent(event: FriendRequestSentEvent): Promise<void> {
            if (!this.pushService.isAvailable) return;

            try {
                  await this.processFriendRequest(event);
            } catch (error) {
                  this.logger.error(
                        `[FRIEND_NOTIF] Failed to process friendship.request.sent: ${(error as Error).message}`,
                  );
            }
      }

      private async processFriendRequest(event: FriendRequestSentEvent): Promise<void> {
            const { toUserId, fromUserId, requestId } = event;

            // Skip if recipient is online — socket event already delivers notification
            const isOnline = await this.presenceService.isUserOnline(toUserId);
            if (isOnline) {
                  this.logger.debug(
                        `[FRIEND_NOTIF] Skipping friend request push — recipient ${toUserId.slice(0, 8)}… is online`,
                  );
                  return;
            }

            // Resolve sender profile for push content
            const senderProfile = await this.resolveUserProfile(fromUserId);

            await this.pushService.sendFriendRequestPush({
                  recipientId: toUserId,
                  fromUserId,
                  fromUserName: senderProfile.displayName,
                  fromUserAvatar: senderProfile.avatar,
                  requestId,
            });
      }

      // ─────────────────────────────────────────────────────────────────────
      // Friend request accepted → push to original requester
      // ─────────────────────────────────────────────────────────────────────

      @OnEvent('friendship.accepted')
      async handleFriendRequestAccepted(event: FriendRequestAcceptedEvent): Promise<void> {
            if (!this.pushService.isAvailable) return;

            try {
                  await this.processFriendAccepted(event);
            } catch (error) {
                  this.logger.error(
                        `[FRIEND_NOTIF] Failed to process friendship.accepted: ${(error as Error).message}`,
                  );
            }
      }

      private async processFriendAccepted(event: FriendRequestAcceptedEvent): Promise<void> {
            const { requesterId, acceptedBy, friendshipId } = event;

            // Push goes to the original requester (they sent the request, someone accepted)
            const isOnline = await this.presenceService.isUserOnline(requesterId);
            if (isOnline) {
                  this.logger.debug(
                        `[FRIEND_NOTIF] Skipping friend accepted push — requester ${requesterId.slice(0, 8)}… is online`,
                  );
                  return;
            }

            // Resolve accepter profile for push content
            const accepterProfile = await this.resolveUserProfile(acceptedBy);

            await this.pushService.sendFriendAcceptedPush({
                  recipientId: requesterId,
                  acceptedByUserId: acceptedBy,
                  acceptedByName: accepterProfile.displayName,
                  acceptedByAvatar: accepterProfile.avatar,
                  friendshipId,
            });
      }

      // ─── Helpers ──────────────────────────────────────────────────────

      /**
       * Resolve user display name and avatar. Lightweight select (2 columns).
       * Fallback to 'Người dùng' if user not found.
       */
      private async resolveUserProfile(
            userId: string,
      ): Promise<{ displayName: string; avatar: string | null }> {
            try {
                  const user = await this.prisma.user.findUnique({
                        where: { id: userId },
                        select: { displayName: true, avatarUrl: true },
                  });
                  return {
                        displayName: user?.displayName ?? 'Người dùng',
                        avatar: user?.avatarUrl ?? null,
                  };
            } catch {
                  return { displayName: 'Người dùng', avatar: null };
            }
      }
}
