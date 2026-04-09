/**
 * FriendshipNotificationListener
 *
 * Listens to friendship domain events and emits socket notifications
 * to relevant users in real-time.
 *
 * Event mapping (EventEmitter → Socket.IO):
 *   friendship.request.sent      → FRIEND_REQUEST_RECEIVED  (to target)
 *   friendship.accepted           → FRIEND_REQUEST_ACCEPTED  (to requester)
 *   friendship.request.cancelled  → FRIEND_REQUEST_CANCELLED (to target)
 *   friendship.request.declined   → FRIEND_REQUEST_DECLINED  (to requester)
 *   friendship.unfriended         → FRIEND_UNFRIENDED        (to other user)
 */

import { Injectable } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import { PrismaService } from '@database/prisma.service';
import { SocketEvents } from '@common/constants/socket-events.constant';
import { InternalEventNames } from '@common/contracts/events/event-names';
import type {
  FriendRequestSentEvent,
  FriendRequestAcceptedEvent,
  FriendRequestRejectedEvent,
  FriendRequestCancelledEvent,
  UnfriendedEvent,
} from '@modules/friendship/events/friendship.events';
import {
  OUTBOUND_SOCKET_EVENT,
  ISocketEmitEvent,
} from '@common/events/outbound-socket.event';

@Injectable()
export class FriendshipNotificationListener extends IdempotentListener {
  constructor(
    prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super(prisma);
  }

  /**
   * When User A sends a friend request to User B,
   * notify User B (request received) AND User A (sync across devices).
   */
  @OnEvent(InternalEventNames.FRIENDSHIP_REQUEST_SENT, { async: true })
  async handleFriendRequestSent(event: FriendRequestSentEvent): Promise<void> {
    try {
      this.logger.debug(
        `[FriendshipNotif] Friend request sent: ${event.fromUserId} → ${event.toUserId}`,
      );

      const payload = {
        friendshipId: event.requestId,
        fromUserId: event.fromUserId,
        toUserId: event.toUserId,
      };

      // Notify recipient
      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
        event: SocketEvents.FRIEND_REQUEST_RECEIVED as any,
        userId: event.toUserId,
        data: payload,
      });

      // Notify sender (Cross-device sync)
      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
        event: SocketEvents.FRIEND_REQUEST_RECEIVED as any,
        userId: event.fromUserId,
        data: payload,
      });
    } catch (error) {
      this.logger.error(
        `[FriendshipNotif] Failed to emit friendship.request.sent socket event`,
        error,
      );
    }
  }

  /**
   * When User B accepts friend request from User A,
   * notify User A (the original requester) AND User B (accepter sync).
   */
  @OnEvent(InternalEventNames.FRIENDSHIP_ACCEPTED, { async: true })
  async handleFriendRequestAccepted(
    event: FriendRequestAcceptedEvent,
  ): Promise<void> {
    try {
      this.logger.debug(
        `[FriendshipNotif] Friend request accepted: ${event.acceptedBy} accepted ${event.requesterId}'s request`,
      );

      const payload = {
        friendshipId: event.friendshipId,
        acceptedBy: event.acceptedBy,
        requesterId: event.requesterId,
      };

      // Notify original requester
      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
        event: SocketEvents.FRIEND_REQUEST_ACCEPTED as any,
        userId: event.requesterId,
        data: payload,
      });

      // Notify accepter (Cross-device sync)
      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
        event: SocketEvents.FRIEND_REQUEST_ACCEPTED as any,
        userId: event.acceptedBy,
        data: payload,
      });
    } catch (error) {
      this.logger.error(
        `[FriendshipNotif] Failed to emit friendship.accepted socket event`,
        error,
      );
    }
  }

  /**
   * When User A cancels their sent friend request,
   * notify the target user (User B) AND User A (canceller sync).
   */
  @OnEvent(InternalEventNames.FRIENDSHIP_REQUEST_CANCELLED, { async: true })
  async handleFriendRequestCancelled(
    event: FriendRequestCancelledEvent,
  ): Promise<void> {
    try {
      this.logger.debug(
        `[FriendshipNotif] Friend request cancelled: ${event.cancelledBy} cancelled request to ${event.targetUserId}`,
      );

      const payload = {
        friendshipId: event.friendshipId,
        cancelledBy: event.cancelledBy,
        targetUserId: event.targetUserId,
        eventType: event.eventType,
      };

      // Notify target user
      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
        event: SocketEvents.FRIEND_REQUEST_CANCELLED as any,
        userId: event.targetUserId,
        data: payload,
      });

      // Notify canceller (Cross-device sync)
      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
        event: SocketEvents.FRIEND_REQUEST_CANCELLED as any,
        userId: event.cancelledBy,
        data: payload,
      });
    } catch (error) {
      this.logger.error(
        `[FriendshipNotif] Failed to emit friendship.request.cancelled socket event`,
        error,
      );
    }
  }

  /**
   * When User B declines friend request from User A,
   * notify User A (the requester) AND User B (decliner sync).
   */
  @OnEvent(InternalEventNames.FRIENDSHIP_REQUEST_DECLINED, { async: true })
  async handleFriendRequestDeclined(
    event: FriendRequestRejectedEvent,
  ): Promise<void> {
    try {
      this.logger.debug(
        `[FriendshipNotif] Friend request declined: ${event.toUserId} declined ${event.fromUserId}'s request`,
      );

      const payload = {
        friendshipId: event.requestId,
        declinedBy: event.toUserId,
        requesterId: event.fromUserId,
      };

      // Notify requester
      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
        event: SocketEvents.FRIEND_REQUEST_DECLINED as any,
        userId: event.fromUserId,
        data: payload,
      });

      // Notify decliner (Cross-device sync)
      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
        event: SocketEvents.FRIEND_REQUEST_DECLINED as any,
        userId: event.toUserId,
        data: payload,
      });
    } catch (error) {
      this.logger.error(
        `[FriendshipNotif] Failed to emit friendship.request.declined socket event`,
        error,
      );
    }
  }

  /**
   * When User A unfriends User B,
   * notify both participants.
   */
  @OnEvent(InternalEventNames.FRIENDSHIP_UNFRIENDED, { async: true })
  async handleUnfriended(event: UnfriendedEvent): Promise<void> {
    try {
      this.logger.debug(
        `[FriendshipNotif] Unfriended: ${event.initiatedBy} unfriended user in ${event.friendshipId}`,
      );

      const payload = {
        friendshipId: event.friendshipId,
        initiatedBy: event.initiatedBy,
        eventType: event.eventType,
      };

      // Notify both participants
      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
        event: SocketEvents.FRIEND_UNFRIENDED as any,
        userId: event.user1Id,
        data: payload,
      });

      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
        event: SocketEvents.FRIEND_UNFRIENDED as any,
        userId: event.user2Id,
        data: payload,
      });
    } catch (error) {
      this.logger.error(
        `[FriendshipNotif] Failed to emit friendship.unfriended socket event`,
        error,
      );
    }
  }
}
