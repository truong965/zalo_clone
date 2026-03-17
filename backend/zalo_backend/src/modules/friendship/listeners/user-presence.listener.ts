import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { SocketEvents } from '@common/constants/socket-events.constant';
import {
  FRIENDSHIP_READ_PORT,
  PRIVACY_READ_PORT,
} from '@common/contracts/internal-api';
import type {
  IFriendshipReadPort,
  IPrivacyReadPort,
} from '@common/contracts/internal-api';
import {
  OUTBOUND_SOCKET_EVENT,
  ISocketEmitEvent,
} from '@common/events/outbound-socket.event';

/**
 * Listens to user presence events (`USER_SOCKET_CONNECTED`, `USER_SOCKET_DISCONNECTED`)
 * and notifies their friends via the generic `socket.outbound` router.
 *
 * This breaks the tight coupling where Socket Gateway previously had to import
 * FriendshipService and PrivacyService directly just to notify friends.
 */
@Injectable()
export class UserPresenceListener {
  private readonly logger = new Logger(UserPresenceListener.name);

  constructor(
    @Inject(FRIENDSHIP_READ_PORT)
    private readonly friendshipRead: IFriendshipReadPort,
    @Inject(PRIVACY_READ_PORT)
    private readonly privacyRead: IPrivacyReadPort,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  @OnEvent(SocketEvents.USER_SOCKET_CONNECTED, { async: true })
  async handleUserConnected(payload: {
    userId: string;
    socketId: string;
    connectedAt: Date;
  }) {
    await this.notifyFriendsPresence(payload.userId, true, payload.connectedAt);
  }

  @OnEvent(SocketEvents.USER_SOCKET_DISCONNECTED, { async: true })
  async handleUserDisconnected(payload: {
    userId: string;
    socketId: string;
    reason: string;
  }) {
    await this.notifyFriendsPresence(payload.userId, false);
  }

  private async notifyFriendsPresence(
    userId: string,
    isOnline: boolean,
    timestamp?: Date,
  ) {
    try {
      const settings = await this.privacyRead.getSettings(userId);
      if (!settings.showOnlineStatus) return;

      const friendIds = await this.friendshipRead.getFriendIdsForPresence(userId);

      if (!friendIds || friendIds.length === 0) return;

      this.logger.debug(
        `[PresenceNotif] User ${userId} is ${isOnline ? 'Online' : 'Offline'}. Notifying ${friendIds.length} friends.`,
      );

      const eventPayload = {
        userId,
        timestamp: (timestamp ?? new Date()).toISOString(),
      };

      const socketEvent: ISocketEmitEvent = {
        event: (isOnline
          ? SocketEvents.FRIEND_ONLINE
          : SocketEvents.FRIEND_OFFLINE) as any,
        data: eventPayload,
        userIds: friendIds,
      };

      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, socketEvent);
    } catch (error) {
      this.logger.error(
        `[PresenceNotif] Failed to notify presence for ${userId}`,
        error,
      );
    }
  }
}
