/**
 * CONTACT DOMAIN EVENTS
 *
 * Owner: ContactModule
 * Description: Events emitted when contacts are synced, aliases changed, or contacts removed.
 *
 * Event naming convention (matches codebase):
 *   contact.alias.updated
 *   contacts.synced
 *   contact.removed
 */

import { DomainEvent } from '@shared/events';

/**
 * Emitted when a user sets or resets the alias for a contact.
 *
 * Listeners:
 *   - ContactCacheListener (contact module) — invalidate Redis name-resolution cache
 *   - ContactNotificationListener (socket module) — push real-time update to owner's socket room
 *
 * Version History:
 *   v1: ownerId, contactUserId, newAliasName, resolvedDisplayName
 */
export class ContactAliasUpdatedEvent extends DomainEvent {
      readonly eventType = 'CONTACT_ALIAS_UPDATED' as const;

      constructor(
            readonly ownerId: string,
            readonly contactUserId: string,
            /** null means alias was reset to phoneBookName / displayName */
            readonly newAliasName: string | null,
            /** Pre-resolved display name (aliasName ?? phoneBookName ?? displayName) */
            readonly resolvedDisplayName: string,
      ) {
            super('ContactModule', 'UserContact', ownerId, 1);
      }

      toJSON() {
            return {
                  ...super.toJSON(),
                  eventType: this.eventType,
                  ownerId: this.ownerId,
                  contactUserId: this.contactUserId,
                  newAliasName: this.newAliasName,
                  resolvedDisplayName: this.resolvedDisplayName,
            };
      }
}

/**
 * Emitted after syncContacts() completes.
 *
 * Listeners:
 *   - ContactCacheListener — optional metrics / analytics
 *
 * Version History:
 *   v1: ownerId, totalContacts, matchedCount, durationMs
 */
export class ContactsSyncedEvent extends DomainEvent {
      readonly eventType = 'CONTACTS_SYNCED' as const;

      constructor(
            readonly ownerId: string,
            readonly totalContacts: number,
            readonly matchedCount: number,
            readonly durationMs: number,
      ) {
            super('ContactModule', 'UserContact', ownerId, 1);
      }

      toJSON() {
            return {
                  ...super.toJSON(),
                  eventType: this.eventType,
                  ownerId: this.ownerId,
                  totalContacts: this.totalContacts,
                  matchedCount: this.matchedCount,
                  durationMs: this.durationMs,
            };
      }
}

/**
 * Emitted when a contact record is deleted.
 *
 * Listeners:
 *   - ContactCacheListener — invalidate Redis name-resolution cache
 *
 * Version History:
 *   v1: ownerId, contactUserId
 */
export class ContactRemovedEvent extends DomainEvent {
      readonly eventType = 'CONTACT_REMOVED' as const;

      constructor(
            readonly ownerId: string,
            readonly contactUserId: string,
      ) {
            super('ContactModule', 'UserContact', ownerId, 1);
      }

      toJSON() {
            return {
                  ...super.toJSON(),
                  eventType: this.eventType,
                  ownerId: this.ownerId,
                  contactUserId: this.contactUserId,
            };
      }
}
