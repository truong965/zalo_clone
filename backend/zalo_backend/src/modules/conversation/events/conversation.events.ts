/**
 * CONVERSATION DOMAIN EVENTS
 *
 * Owner: ConversationModule
 * Description: Events emitted during conversation lifecycle and membership changes
 *
 * Business Rules:
 * - ConversationCreatedEvent: New direct or group conversation created
 * - ConversationMemberAddedEvent: Member(s) added to a group
 * - ConversationMemberLeftEvent: Member left or was removed from a group
 * - ConversationMemberPromotedEvent: Member promoted to admin
 * - ConversationMemberDemotedEvent: Member demoted from admin
 */

import { DomainEvent } from '@shared/events';

/**
 * Emitted when a new conversation is created.
 *
 * Listeners:
 * - RedisModule: Create conversation entry in cache
 * - SocketModule: Notify participants in real-time
 *
 * Types:
 * - DIRECT: 1-to-1 conversation between two users
 * - GROUP: Group conversation (3+ members)
 *
 * Critical Event: YES (audit trail for group creation)
 *
 * @version 1
 */
export class ConversationCreatedEvent extends DomainEvent {
  readonly eventType = 'CONVERSATION_CREATED';
  readonly version = 1;

  constructor(
    readonly conversationId: string,
    readonly createdBy: string,
    readonly type: string, // ConversationType: DIRECT | GROUP
    readonly participantIds: string[],
    readonly name?: string, // For GROUP conversations
  ) {
    super('ConversationModule', 'Conversation', conversationId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      conversationId: this.conversationId,
      createdBy: this.createdBy,
      type: this.type,
      participantIds: this.participantIds,
      name: this.name,
      eventType: this.eventType,
    };
  }
}

/**
 * Emitted when member(s) are added to a conversation.
 *
 * Critical Event: YES
 */
export class ConversationMemberAddedEvent extends DomainEvent {
  readonly eventType = 'CONVERSATION_MEMBER_ADDED';
  readonly version = 1;

  constructor(
    readonly conversationId: string,
    readonly addedBy: string,
    readonly memberIds: string[],
  ) {
    super('ConversationModule', 'Conversation', conversationId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      conversationId: this.conversationId,
      addedBy: this.addedBy,
      memberIds: this.memberIds,
      eventType: this.eventType,
    };
  }
}

/**
 * Emitted when a member leaves or is removed from a conversation.
 *
 * Critical Event: YES
 */
export class ConversationMemberLeftEvent extends DomainEvent {
  readonly eventType = 'CONVERSATION_MEMBER_LEFT';
  readonly version = 1;

  constructor(
    readonly conversationId: string,
    readonly memberId: string,
    readonly kickedBy?: string,
  ) {
    super('ConversationModule', 'Conversation', conversationId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      conversationId: this.conversationId,
      memberId: this.memberId,
      kickedBy: this.kickedBy,
      eventType: this.eventType,
    };
  }
}

/**
 * Emitted when a member is promoted to admin.
 *
 * Critical Event: YES
 */
export class ConversationMemberPromotedEvent extends DomainEvent {
  readonly eventType = 'CONVERSATION_MEMBER_PROMOTED';
  readonly version = 1;

  constructor(
    readonly conversationId: string,
    readonly promotedBy: string,
    readonly memberId: string,
  ) {
    super('ConversationModule', 'Conversation', conversationId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      conversationId: this.conversationId,
      promotedBy: this.promotedBy,
      memberId: this.memberId,
      eventType: this.eventType,
    };
  }
}

/**
 * Emitted when a member is demoted from admin.
 *
 * Critical Event: YES
 */
export class ConversationMemberDemotedEvent extends DomainEvent {
  readonly eventType = 'CONVERSATION_MEMBER_DEMOTED';
  readonly version = 1;

  constructor(
    readonly conversationId: string,
    readonly demotedBy: string,
    readonly memberId: string,
  ) {
    super('ConversationModule', 'Conversation', conversationId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      conversationId: this.conversationId,
      demotedBy: this.demotedBy,
      memberId: this.memberId,
      eventType: this.eventType,
    };
  }
}
