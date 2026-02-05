/**
 * SOCIAL/FRIENDSHIP DOMAIN EVENTS
 *
 * Owner: SocialModule
 * Description: Events emitted during friendship lifecycle (request, accept, reject, remove)
 *
 * Business Rules:
 * - FriendRequestSentEvent: Initiates friendship
 * - FriendRequestAcceptedEvent: Confirms friendship (must have no active block)
 * - FriendRequestRejectedEvent: Declined friendship request
 * - UnfriendedEvent: Terminates existing friendship
 */

import { DomainEvent } from '@shared/events';

/**
 * Emitted when User A sends friend request to User B.
 *
 * Listeners:
 * - MessagingModule: Create notification conversation
 * - SocketModule: Real-time notification to User B
 * - RedisModule: Update friend request cache
 *
 * @version 1
 * @example
 * ```typescript
 * const event = new FriendRequestSentEvent(
 *   requesterId: '550e8400-e29b-41d4-a716-446655440000',
 *   targetUserId: '660e8400-e29b-41d4-a716-446655440111',
 * );
 * ```
 */
export class FriendRequestSentEvent extends DomainEvent {
  readonly eventType = 'FRIEND_REQUEST_SENT';
  readonly version = 1;

  constructor(
    readonly requesterId: string,
    readonly targetUserId: string,
  ) {
    super('SocialModule', 'Friendship', requesterId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      requesterId: this.requesterId,
      targetUserId: this.targetUserId,
      eventType: this.eventType,
    };
  }
}

/**
 * Emitted when User B accepts friend request from User A.
 *
 * Listeners:
 * - MessagingModule: Create direct conversation
 * - SocketModule: Real-time notification to User A
 * - RedisModule: Update friend list cache for both users
 * - NotificationsModule: Send acceptance notification
 *
 * Constraints:
 * - User A must NOT have blocked User B
 * - User B must NOT have blocked User A
 * (These are checked before emitting this event)
 *
 * @version 1
 * @example
 * ```typescript
 * const event = new FriendRequestAcceptedEvent(
 *   requesterId: '550e8400-e29b-41d4-a716-446655440000',
 *   accepterId: '660e8400-e29b-41d4-a716-446655440111',
 * );
 * ```
 */
export class FriendRequestAcceptedEvent extends DomainEvent {
  readonly eventType = 'FRIEND_REQUEST_ACCEPTED';
  readonly version = 1;

  constructor(
    readonly requesterId: string,
    readonly accepterId: string,
  ) {
    super('SocialModule', 'Friendship', requesterId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      requesterId: this.requesterId,
      accepterId: this.accepterId,
      eventType: this.eventType,
    };
  }
}

/**
 * Emitted when User B rejects friend request from User A.
 *
 * Listeners:
 * - RedisModule: Update friend request cache
 * - SocketModule: Optional real-time notification
 *
 * @version 1
 * @example
 * ```typescript
 * const event = new FriendRequestRejectedEvent(
 *   requesterId: '550e8400-e29b-41d4-a716-446655440000',
 *   rejecterId: '660e8400-e29b-41d4-a716-446655440111',
 * );
 * ```
 */
export class FriendRequestRejectedEvent extends DomainEvent {
  readonly eventType = 'FRIEND_REQUEST_REJECTED';
  readonly version = 1;

  constructor(
    readonly requesterId: string,
    readonly rejecterId: string,
  ) {
    super('SocialModule', 'Friendship', rejecterId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      requesterId: this.requesterId,
      rejecterId: this.rejecterId,
      eventType: this.eventType,
    };
  }
}

/**
 * Emitted when User A unfriends User B (removes existing friendship).
 *
 * Listeners:
 * - MessagingModule: Archive direct conversation
 * - RedisModule: Update friend list cache for both
 * - SocketModule: Real-time notification to User B
 * - CallModule: Optional - terminate active calls
 *
 * @version 1
 * @example
 * ```typescript
 * const event = new UnfriendedEvent(
 *   initiatorId: '550e8400-e29b-41d4-a716-446655440000',
 *   removedFriendId: '660e8400-e29b-41d4-a716-446655440111',
 * );
 * ```
 */
export class UnfriendedEvent extends DomainEvent {
  readonly eventType = 'UNFRIENDED';
  readonly version = 1;

  constructor(
    readonly initiatorId: string,
    readonly removedFriendId: string,
  ) {
    super('SocialModule', 'Friendship', initiatorId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      initiatorId: this.initiatorId,
      removedFriendId: this.removedFriendId,
      eventType: this.eventType,
    };
  }
}
