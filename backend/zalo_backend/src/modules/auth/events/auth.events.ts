/**
 * AUTH/USER DOMAIN EVENTS
 *
 * Owner: AuthModule/UsersModule
 * Description: Events emitted during user lifecycle (registration, profile update)
 *
 * Business Rules:
 * - UserRegisteredEvent: New user account created
 */

import { DomainEvent } from '@shared/events';

/**
 * Emitted when a new user registers in the system.
 *
 * Listeners:
 * - NotificationsModule: Send welcome notification
 * - AnalyticsModule: Track user growth metrics
 * - RedisModule: Initialize user profile cache
 * - SocketModule: Announce new user (optional, based on privacy)
 *
 * Triggers:
 * - User signs up via phone number + OTP
 * - User creates profile with display name
 *
 * Critical Event: YES (compliance, user onboarding tracking)
 *
 * @version 1
 * @example
 * ```typescript
 * const event = new UserRegisteredEvent(
 *   userId: '550e8400-e29b-41d4-a716-446655440000',
 *   phoneNumber: '+84912345678',
 *   displayName: 'Truong Dev',
 * );
 * ```
 */
export class UserRegisteredEvent extends DomainEvent {
  readonly eventType = 'USER_REGISTERED';
  readonly version = 1;

  constructor(
    readonly userId: string,
    readonly phoneNumber: string,
    readonly displayName: string,
    readonly email?: string,
  ) {
    super('AuthModule', 'User', userId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      userId: this.userId,
      phoneNumber: this.phoneNumber,
      displayName: this.displayName,
      email: this.email,
      eventType: this.eventType,
    };
  }
}
