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
import { OnEvent } from '@nestjs/event-emitter';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import { PrismaService } from '@database/prisma.service';
import { SocketGateway } from '../socket.gateway';
import { SocketEvents } from '@common/constants/socket-events.constant';
import type {
      FriendRequestSentEvent,
      FriendRequestAcceptedEvent,
      FriendRequestRejectedEvent,
      FriendRequestCancelledEvent,
      UnfriendedEvent,
} from '@modules/friendship/events/friendship.events';

@Injectable()
export class FriendshipNotificationListener extends IdempotentListener {
      constructor(
            prisma: PrismaService,
            private readonly socketGateway: SocketGateway,
      ) {
            super(prisma);
      }

      /**
       * When User A sends a friend request to User B,
       * notify User B in real-time.
       */
      @OnEvent('friendship.request.sent')
      async handleFriendRequestSent(event: FriendRequestSentEvent): Promise<void> {
            this.logger.debug(
                  `[FriendshipNotif] Friend request sent: ${event.fromUserId} → ${event.toUserId}`,
            );

            await this.socketGateway.emitToUser(
                  event.toUserId,
                  SocketEvents.FRIEND_REQUEST_RECEIVED as string,
                  {
                        friendshipId: event.requestId,
                        fromUserId: event.fromUserId,
                        toUserId: event.toUserId,
                  },
            );
      }

      /**
       * When User B accepts friend request from User A,
       * notify User A (the original requester).
       */
      @OnEvent('friendship.accepted')
      async handleFriendRequestAccepted(
            event: FriendRequestAcceptedEvent,
      ): Promise<void> {
            this.logger.debug(
                  `[FriendshipNotif] Friend request accepted: ${event.acceptedBy} accepted ${event.requesterId}'s request`,
            );

            await this.socketGateway.emitToUser(
                  event.requesterId,
                  SocketEvents.FRIEND_REQUEST_ACCEPTED as string,
                  {
                        friendshipId: event.friendshipId,
                        acceptedBy: event.acceptedBy,
                        requesterId: event.requesterId,
                  },
            );
      }

      /**
       * When User A cancels their sent friend request,
       * notify the target user (User B).
       */
      @OnEvent('friendship.request.cancelled')
      async handleFriendRequestCancelled(
            event: FriendRequestCancelledEvent,
      ): Promise<void> {
            this.logger.debug(
                  `[FriendshipNotif] Friend request cancelled: ${event.cancelledBy} cancelled request to ${event.targetUserId}`,
            );

            await this.socketGateway.emitToUser(
                  event.targetUserId,
                  SocketEvents.FRIEND_REQUEST_CANCELLED as string,
                  {
                        friendshipId: event.friendshipId,
                        cancelledBy: event.cancelledBy,
                        targetUserId: event.targetUserId,
                        eventType: event.eventType,
                  },
            );
      }

      /**
       * When User B declines friend request from User A,
       * notify User A (the requester).
       */
      @OnEvent('friendship.request.declined')
      async handleFriendRequestDeclined(
            event: FriendRequestRejectedEvent,
      ): Promise<void> {
            this.logger.debug(
                  `[FriendshipNotif] Friend request declined: ${event.toUserId} declined ${event.fromUserId}'s request`,
            );

            await this.socketGateway.emitToUser(
                  event.fromUserId,
                  SocketEvents.FRIEND_REQUEST_DECLINED as string,
                  {
                        friendshipId: event.requestId,
                        declinedBy: event.toUserId,
                        requesterId: event.fromUserId,
                  },
            );
      }

      /**
       * When User A unfriends User B,
       * notify User B.
       */
      @OnEvent('friendship.unfriended')
      async handleUnfriended(event: UnfriendedEvent): Promise<void> {
            // The other user is whichever is NOT the initiator
            const otherUserId =
                  event.initiatedBy === event.user1Id ? event.user2Id : event.user1Id;

            this.logger.debug(
                  `[FriendshipNotif] Unfriended: ${event.initiatedBy} unfriended ${otherUserId}`,
            );

            await this.socketGateway.emitToUser(
                  otherUserId,
                  SocketEvents.FRIEND_UNFRIENDED as string,
                  {
                        friendshipId: event.friendshipId,
                        initiatedBy: event.initiatedBy,
                        userId: otherUserId,
                        eventType: event.eventType,
                  },
            );
      }
}
