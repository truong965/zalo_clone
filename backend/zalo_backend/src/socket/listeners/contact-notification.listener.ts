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
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import { SocketGateway } from '../socket.gateway';
import { SocketEvents } from '@common/constants/socket-events.constant';
import type { ContactAliasUpdatedEvent } from '@modules/contact/events/contact.events';

@Injectable()
export class ContactNotificationListener extends IdempotentListener {
      constructor(
            prisma: PrismaService,
            private readonly socketGateway: SocketGateway,
      ) {
            super(prisma);
      }

      /**
       * When a user updates or resets a contact alias, push the resolved name
       * to their personal socket room so the UI can update without a page refresh.
       *
       * Only the owner is notified — alias is visible to them alone.
       */
      @OnEvent('contact.alias.updated')
      async handleContactAliasUpdated(event: ContactAliasUpdatedEvent): Promise<void> {
            this.logger.debug(
                  `[ContactNotif] alias.updated: owner=${event.ownerId} contact=${event.contactUserId}`,
            );

            await this.withIdempotency(
                  event.eventId,
                  async () => {
                        await this.socketGateway.emitToUser(
                              event.ownerId,
                              SocketEvents.CONTACT_ALIAS_UPDATED,
                              {
                                    contactUserId: event.contactUserId,
                                    aliasName: event.newAliasName,
                                    resolvedDisplayName: event.resolvedDisplayName,
                              },
                        );
                  },
                  'ContactNotificationListener.handleContactAliasUpdated',
                  event.version,
                  event.correlationId,
            );
      }
}
