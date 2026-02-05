/**
 * Friendship Domain Event Contracts
 *
 * Payload interfaces for friendship-related events.
 * Event classes in FriendshipModule should produce payloads matching these interfaces.
 *
 * Event naming: friendship.* (friendship.accepted, friendship.unfriended, etc.)
 *
 * @see docs/IMPLEMENTATION_PLAN_BLOCK_PRIVACY_FRIENDSHIP.md
 */

import type { BaseEvent } from './base-event.interface';

export interface FriendshipRequestSentPayload extends BaseEvent {
  eventType: 'FRIEND_REQUEST_SENT';
  requestId: string;
  fromUserId: string;
  toUserId: string;
}

export interface FriendshipAcceptedPayload extends BaseEvent {
  eventType: 'FRIEND_REQUEST_ACCEPTED';
  friendshipId: string;
  acceptedBy: string;
  requesterId: string;
  user1Id: string;
  user2Id: string;
}

export interface FriendshipRejectedPayload extends BaseEvent {
  eventType: 'FRIEND_REQUEST_REJECTED';
  requestId: string;
  fromUserId: string;
  toUserId: string;
}

export interface FriendshipCancelledPayload extends BaseEvent {
  eventType: 'FRIEND_REQUEST_CANCELLED';
  friendshipId: string;
  cancelledBy: string;
  targetUserId: string;
}

export interface UnfriendedPayload extends BaseEvent {
  eventType: 'UNFRIENDED';
  friendshipId: string;
  initiatedBy: string;
  user1Id: string;
  user2Id: string;
}
