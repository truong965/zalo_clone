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
import type {
      FriendRequestSentEvent,
      FriendRequestAcceptedEvent,
      FriendRequestRejectedEvent,
      FriendRequestCancelledEvent,
      UnfriendedEvent,
} from '@modules/friendship/events/friendship.events';
import { OUTBOUND_SOCKET_EVENT, ISocketEmitEvent } from '@common/events/outbound-socket.event';

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
       * notify User B in real-time.
       */
      @OnEvent('friendship.request.sent', { async: true })
      async handleFriendRequestSent(event: FriendRequestSentEvent): Promise<void> {
            try {
                  this.logger.debug(
                        `[FriendshipNotif] Friend request sent: ${event.fromUserId} → ${event.toUserId}`,
                  );

                  const socketEvent: ISocketEmitEvent = {
                        event: SocketEvents.FRIEND_REQUEST_RECEIVED as any,
                        userId: event.toUserId,
                        data: {
                              friendshipId: event.requestId,
                              fromUserId: event.fromUserId,
                              toUserId: event.toUserId,
                        }
                  };
                  this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, socketEvent);
            } catch (error) {
                  this.logger.error(
                        `[FriendshipNotif] Failed to emit friendship.request.sent socket event`,
                        error,
                  );
            }
      }

      /**
       * When User B accepts friend request from User A,
       * notify User A (the original requester).
       */
      @OnEvent('friendship.accepted', { async: true })
      async handleFriendRequestAccepted(
            event: FriendRequestAcceptedEvent,
      ): Promise<void> {
            try {
                  this.logger.debug(
                        `[FriendshipNotif] Friend request accepted: ${event.acceptedBy} accepted ${event.requesterId}'s request`,
                  );

                  const socketEvent: ISocketEmitEvent = {
                        event: SocketEvents.FRIEND_REQUEST_ACCEPTED as any,
                        userId: event.requesterId,
                        data: {
                              friendshipId: event.friendshipId,
                              acceptedBy: event.acceptedBy,
                              requesterId: event.requesterId,
                        }
                  };
                  this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, socketEvent);
            } catch (error) {
                  this.logger.error(
                        `[FriendshipNotif] Failed to emit friendship.accepted socket event`,
                        error,
                  );
            }
      }

      /**
       * When User A cancels their sent friend request,
       * notify the target user (User B).
       */
      @OnEvent('friendship.request.cancelled', { async: true })
      async handleFriendRequestCancelled(
            event: FriendRequestCancelledEvent,
      ): Promise<void> {
            try {
                  this.logger.debug(
                        `[FriendshipNotif] Friend request cancelled: ${event.cancelledBy} cancelled request to ${event.targetUserId}`,
                  );

                  const socketEvent: ISocketEmitEvent = {
                        event: SocketEvents.FRIEND_REQUEST_CANCELLED as any,
                        userId: event.targetUserId,
                        data: {
                              friendshipId: event.friendshipId,
                              cancelledBy: event.cancelledBy,
                              targetUserId: event.targetUserId,
                              eventType: event.eventType,
                        }
                  };
                  this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, socketEvent);
            } catch (error) {
                  this.logger.error(
                        `[FriendshipNotif] Failed to emit friendship.request.cancelled socket event`,
                        error,
                  );
            }
      }

      /**
       * When User B declines friend request from User A,
       * notify User A (the requester).
       */
      @OnEvent('friendship.request.declined', { async: true })
      async handleFriendRequestDeclined(
            event: FriendRequestRejectedEvent,
      ): Promise<void> {
            try {
                  this.logger.debug(
                        `[FriendshipNotif] Friend request declined: ${event.toUserId} declined ${event.fromUserId}'s request`,
                  );

                  const socketEvent: ISocketEmitEvent = {
                        event: SocketEvents.FRIEND_REQUEST_DECLINED as any,
                        userId: event.fromUserId,
                        data: {
                              friendshipId: event.requestId,
                              declinedBy: event.toUserId,
                              requesterId: event.fromUserId,
                        }
                  };
                  this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, socketEvent);
            } catch (error) {
                  this.logger.error(
                        `[FriendshipNotif] Failed to emit friendship.request.declined socket event`,
                        error,
                  );
            }
      }

      /**
       * When User A unfriends User B,
       * notify User B.
       */
      @OnEvent('friendship.unfriended', { async: true })
      async handleUnfriended(event: UnfriendedEvent): Promise<void> {
            try {
                  // The other user is whichever is NOT the initiator
                  const otherUserId =
                        event.initiatedBy === event.user1Id ? event.user2Id : event.user1Id;

                  this.logger.debug(
                        `[FriendshipNotif] Unfriended: ${event.initiatedBy} unfriended ${otherUserId}`,
                  );

                  const socketEvent: ISocketEmitEvent = {
                        event: SocketEvents.FRIEND_UNFRIENDED as any,
                        userId: otherUserId,
                        data: {
                              friendshipId: event.friendshipId,
                              initiatedBy: event.initiatedBy,
                              userId: otherUserId,
                              eventType: event.eventType,
                        }
                  };
                  this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, socketEvent);

            } catch (error) {
                  this.logger.error(
                        `[FriendshipNotif] Failed to emit friendship.unfriended socket event`,
                        error,
                  );
            }
      }
}
