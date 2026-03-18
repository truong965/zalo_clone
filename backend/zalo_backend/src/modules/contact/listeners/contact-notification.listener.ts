/**
 * ContactNotificationListener
 *
 * Listens to contact domain events (owned by ContactModule) and emits
 * real-time Socket.IO notifications to the relevant user room.
 *
 * Lives in SocketModule so it has access to SocketGateway without creating
 * a circular dependency between ContactModule and SocketModule.
 *
 * Event mapping (EventEmitter → Socket.IO):
 *   contact.alias.updated → CONTACT_ALIAS_UPDATED (to owner's room only)
 *
 * Idempotency:
 *   All handlers use withIdempotency() from IdempotentListener.
 *   Socket emit is idempotent — emitting the same payload twice is harmless.
 */

import { Injectable } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { InternalEventNames } from '@common/contracts/events';
import { PrismaService } from '@database/prisma.service';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import { SocketEvents } from '@common/constants/socket-events.constant';
import type { ContactAliasUpdatedEvent } from '@modules/contact/events/contact.events';
import {
  OUTBOUND_SOCKET_EVENT,
  ISocketEmitEvent,
} from '@common/events/outbound-socket.event';

@Injectable()
export class ContactNotificationListener extends IdempotentListener {
  constructor(
    prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super(prisma);
  }

  /**
   * When a user updates or resets a contact alias, push the resolved name
   * to their personal socket room so the UI can update without a page refresh.
   *
   * Only the owner is notified — alias is visible to them alone.
   */
  @OnEvent(InternalEventNames.CONTACT_ALIAS_UPDATED, { async: true })
  async handleContactAliasUpdated(
    event: ContactAliasUpdatedEvent,
  ): Promise<void> {
    try {
      this.logger.debug(
        `[ContactNotif] alias.updated: owner=${event.ownerId} contact=${event.contactUserId}`,
      );

      await this.withIdempotency(
        event.eventId,
        async () => {
          const socketEvent: ISocketEmitEvent = {
            event: SocketEvents.CONTACT_ALIAS_UPDATED as any,
            userId: event.ownerId,
            data: {
              contactUserId: event.contactUserId,
              aliasName: event.newAliasName,
              resolvedDisplayName: event.resolvedDisplayName,
            },
          };
          this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, socketEvent);
        },
        'ContactNotificationListener.handleContactAliasUpdated',
        event.version,
        event.correlationId,
      );
    } catch (error) {
      this.logger.error(
        `[ContactNotif] Failed to emit contact.alias.updated socket event`,
        error,
      );
    }
  }
}
