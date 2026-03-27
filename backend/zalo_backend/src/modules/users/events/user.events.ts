/**
 * USER DOMAIN EVENTS
 *
 * Owner: UsersModule
 * Description: Events emitted during user profile lifecycle
 *
 * Business Rules:
 * - UserProfileUpdatedEvent: User changed their profile (display name, avatar, bio, etc.)
 */

import { DomainEvent } from '@shared/events';

/**
 * Emitted when a user updates their profile.
 *
 * Listeners:
 * - ConversationEventHandler: Sync display name across conversations
 * - SearchEventListener: Invalidate user/contact search cache
 *
 * Critical Event: NO (not persisted to event store)
 *
 * @version 1
 */
export class UserProfileUpdatedEvent extends DomainEvent {
  readonly eventType = 'USER_PROFILE_UPDATED';
  readonly version = 1;

  constructor(
    readonly userId: string,
    readonly updates: {
      displayName?: string;
      email?: string;
      avatarUrl?: string;
      bio?: string;
      gender?: string;
      dateOfBirth?: Date;
    },
  ) {
    super('UsersModule', 'User', userId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      userId: this.userId,
      updates: this.updates,
      eventType: this.eventType,
    };
  }
}
