import { DomainEvent } from '@shared/events';

/**
 * Emitted when a user pins a conversation (personal action).
 *
 * Listeners:
 * - ConversationPinSocketListener: Emit socket "conversation:pinned" to user's devices (cross-device sync)
 */
export class ConversationPinnedEvent extends DomainEvent {
  readonly eventType = 'CONVERSATION_PINNED';
  readonly version = 1;

  constructor(
    readonly conversationId: string,
    readonly userId: string,
    readonly pinnedAt: Date,
  ) {
    super('ConversationModule', 'ConversationMember', conversationId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      conversationId: this.conversationId,
      userId: this.userId,
      pinnedAt: this.pinnedAt,
      eventType: this.eventType,
    };
  }
}

/**
 * Emitted when a user unpins a conversation (personal action).
 *
 * Listeners:
 * - ConversationPinSocketListener: Emit socket "conversation:unpinned" to user's devices (cross-device sync)
 */
export class ConversationUnpinnedEvent extends DomainEvent {
  readonly eventType = 'CONVERSATION_UNPINNED';
  readonly version = 1;

  constructor(
    readonly conversationId: string,
    readonly userId: string,
  ) {
    super('ConversationModule', 'ConversationMember', conversationId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      conversationId: this.conversationId,
      userId: this.userId,
      eventType: this.eventType,
    };
  }
}
