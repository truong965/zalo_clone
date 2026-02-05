/**
 * BLOCK DOMAIN EVENTS
 *
 * Owner: BlockModule
 * Description: Events emitted when users block/unblock each other
 *
 * Business Rules:
 * - UserBlockedEvent: Blocks communication, search visibility, conversation history
 * - UserUnblockedEvent: Restores all communication channels
 */

import { DomainEvent } from '@shared/events';

/**
 * Emitted when User A blocks User B.
 *
 * Listeners:
 * - SocialModule: Invalidate A's contact list cache
 * - SocialModule: Invalidate B's friend list cache
 * - MessagingModule: Close A-B direct conversation
 * - CallModule: Terminate active calls (if any)
 * - SocketModule: Emit real-time notification to connected clients
 *
 * Version History:
 * - v1: blockerId, blockedId
 * - Future v2: Can add reason?: string
 *
 * @example
 * ```typescript
 * const event = new UserBlockedEvent(
 *   blockerId: '550e8400-e29b-41d4-a716-446655440000',
 *   blockedId: '660e8400-e29b-41d4-a716-446655440111',
 *   reason?: 'SPAM',
 * );
 *
 * this.eventEmitter.emit('user.blocked', event);
 * ```
 */
export class UserBlockedEvent extends DomainEvent {
  readonly eventType = 'USER_BLOCKED';
  readonly version = 1;

  constructor(
    readonly blockerId: string,
    readonly blockedId: string,
    readonly blockId: string,
    readonly reason?: string,
  ) {
    super('BlockModule', 'User', blockerId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      blockerId: this.blockerId,
      blockedId: this.blockedId,
      blockId: this.blockId,
      reason: this.reason,
      eventType: this.eventType,
    };
  }
}

/**
 * Emitted when User A unblocks User B.
 *
 * Listeners:
 * - SocialModule: Invalidate A's contact list cache
 * - SocialModule: Invalidate B's friend list cache
 * - SocketModule: Emit real-time notification
 *
 * @example
 * ```typescript
 * const event = new UserUnblockedEvent(
 *   blockerId: '550e8400-e29b-41d4-a716-446655440000',
 *   unblockedId: '660e8400-e29b-41d4-a716-446655440111',
 * );
 *
 * this.eventEmitter.emit('user.unblocked', event);
 * ```
 */
export class UserUnblockedEvent extends DomainEvent {
  readonly eventType = 'USER_UNBLOCKED';
  readonly version = 1;

  constructor(
    readonly blockerId: string,
    readonly blockedId: string,
    readonly blockId: string,
  ) {
    super('BlockModule', 'User', blockerId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      blockerId: this.blockerId,
      blockedId: this.blockedId,
      blockId: this.blockId,
      eventType: this.eventType,
    };
  }
}
