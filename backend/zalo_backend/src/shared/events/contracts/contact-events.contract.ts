/**
 * Contact Domain Event Contracts
 *
 * Payload interfaces for contact-related events.
 * Event classes in ContactModule produce payloads matching these interfaces.
 *
 * Event naming:
 *   contact.alias.updated   — user set/reset a manual alias
 *   contacts.synced         — phone-book sync completed
 *   contact.removed         — contact record deleted
 *
 * @see modules/contact/events/contact.events.ts
 */

import type { BaseEvent } from './base-event.interface';

/**
 * Emitted when a user sets or resets the alias for a contact.
 *
 * Listeners:
 *   - ContactCacheListener  — invalidate Redis name-resolution cache
 *   - ContactNotificationListener (SocketModule) — push real-time update to owner
 */
export interface ContactAliasUpdatedPayload extends BaseEvent {
      eventType: 'CONTACT_ALIAS_UPDATED';
      ownerId: string;
      contactUserId: string;
      /** New aliasName value; null means the alias was reset */
      newAliasName: string | null;
      /** Resolved display name after the change (aliasName ?? phoneBookName ?? displayName) */
      resolvedDisplayName: string;
}

/**
 * Emitted after a phone-book sync completes.
 *
 * Listeners:
 *   - ContactCacheListener — analytics / optional cache warm-up
 */
export interface ContactsSyncedPayload extends BaseEvent {
      eventType: 'CONTACTS_SYNCED';
      ownerId: string;
      totalContacts: number;
      matchedCount: number;
      durationMs: number;
}

/**
 * Emitted when a contact record is deleted.
 *
 * Listeners:
 *   - ContactCacheListener — invalidate Redis name-resolution cache
 */
export interface ContactRemovedPayload extends BaseEvent {
      eventType: 'CONTACT_REMOVED';
      ownerId: string;
      contactUserId: string;
}
