/**
 * SOCIAL/FRIENDSHIP DOMAIN EVENTS
 *
 * Owner: FriendshipModule
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
    readonly requestId: string,
    readonly fromUserId: string,
    readonly toUserId: string,
  ) {
    super('FriendshipModule', 'Friendship', fromUserId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      requestId: this.requestId,
      fromUserId: this.fromUserId,
      toUserId: this.toUserId,
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
    readonly friendshipId: string,
    readonly acceptedBy: string,
    readonly requesterId: string,
    readonly user1Id: string,
    readonly user2Id: string,
  ) {
    super('FriendshipModule', 'Friendship', friendshipId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      friendshipId: this.friendshipId,
      acceptedBy: this.acceptedBy,
      requesterId: this.requesterId,
      user1Id: this.user1Id,
      user2Id: this.user2Id,
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
    readonly requestId: string,
    readonly fromUserId: string,
    readonly toUserId: string,
  ) {
    super('FriendshipModule', 'Friendship', requestId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      requestId: this.requestId,
      fromUserId: this.fromUserId,
      toUserId: this.toUserId,
      eventType: this.eventType,
    };
  }
}

export class FriendRequestCancelledEvent extends DomainEvent {
  readonly eventType = 'FRIEND_REQUEST_CANCELLED';
  readonly version = 1;

  constructor(
    readonly friendshipId: string,
    readonly cancelledBy: string,
    readonly targetUserId: string,
  ) {
    super('FriendshipModule', 'Friendship', friendshipId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      friendshipId: this.friendshipId,
      cancelledBy: this.cancelledBy,
      targetUserId: this.targetUserId,
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
    readonly friendshipId: string,
    readonly initiatedBy: string,
    readonly user1Id: string,
    readonly user2Id: string,
  ) {
    super('FriendshipModule', 'Friendship', friendshipId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      friendshipId: this.friendshipId,
      initiatedBy: this.initiatedBy,
      user1Id: this.user1Id,
      user2Id: this.user2Id,
      eventType: this.eventType,
    };
  }
}
