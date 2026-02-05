import { EventType, MessageType } from '@prisma/client';
import {
  VersionedDomainEvent,
  LinearVersionStrategy,
} from '@common/events/versioned-event';

/**
 * PHASE 3.4: Versioned Messaging Domain Events
 *
 * Messaging events with full versioning support
 * Version history:
 * - V1: messageId, conversationId, senderId, content, type, attachments
 * - V2 (future): Add encryption flags, thread references, reactions count
 */

// ============================================================================
// MESSAGE_SENT EVENT - V1
// ============================================================================

/**
 * V1 (Current): MessageSentEvent
 * Emitted when a message is sent to a conversation
 *
 * Payload:
 * - messageId: Unique message identifier
 * - conversationId: Target conversation
 * - senderId: User who sent
 * - content: Message content
 * - type: Message type (TEXT, IMAGE, VIDEO, etc.)
 * - attachments: Optional media attachments
 */
export class MessageSentEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.MESSAGE_SENT;

  constructor(
    readonly messageId: string,
    readonly conversationId: string,
    readonly senderId: string,
    readonly content: string,
    readonly type: MessageType,
    readonly attachments?: Array<{ id: string; url: string; type: string }>,
    correlationId?: string,
  ) {
    super(conversationId, 'MessagingModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.messageId &&
      !!this.conversationId &&
      !!this.senderId &&
      !!this.content &&
      !!this.type
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      messageId: this.messageId,
      conversationId: this.conversationId,
      senderId: this.senderId,
      content: this.content,
      type: this.type,
      attachments: this.attachments,
    };
  }
}

export class MessageSentEventStrategy extends LinearVersionStrategy<MessageSentEvent> {
  protected currentVersion = 1;

  protected upgradeHandlers: Record<number, (event: any) => any> = {
    // V1 → V2: Add encryption flag (default false for old messages)
    // 1: (event) => ({
    //   ...event,
    //   version: 2,
    //   isEncrypted: false,
    // }),
  };

  protected downgradeHandlers: Record<number, (event: any) => any> = {
    // V2 → V1: Remove encryption flag
    // 2: (event) => {
    //   const { isEncrypted, ...rest } = event;
    //   return { ...rest, version: 1 };
    // },
  };
}

// ============================================================================
// CONVERSATION_CREATED EVENT
// ============================================================================

export class ConversationCreatedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.CONVERSATION_CREATED;

  constructor(
    readonly conversationId: string,
    readonly createdById: string,
    readonly memberIds: string[],
    readonly isGroup: boolean,
    readonly name?: string,
    correlationId?: string,
  ) {
    super(conversationId, 'MessagingModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.conversationId &&
      !!this.createdById &&
      Array.isArray(this.memberIds) &&
      this.memberIds.length > 0
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      conversationId: this.conversationId,
      createdById: this.createdById,
      memberIds: this.memberIds,
      isGroup: this.isGroup,
      name: this.name,
    };
  }
}

export class ConversationCreatedEventStrategy extends LinearVersionStrategy<ConversationCreatedEvent> {
  protected currentVersion = 1;
  protected upgradeHandlers: Record<number, (event: any) => any> = {};
  protected downgradeHandlers: Record<number, (event: any) => any> = {};
}

// ============================================================================
// MESSAGE_DELIVERED EVENT (transient - not stored in event store)
// ============================================================================

export class MessageDeliveredEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.MESSAGE_DELIVERED;

  constructor(
    readonly messageId: string,
    readonly conversationId: string,
    readonly userId: string,
    readonly deliveredAt: Date,
    correlationId?: string,
  ) {
    super(messageId, 'MessagingModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.messageId &&
      !!this.conversationId &&
      !!this.userId
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      messageId: this.messageId,
      conversationId: this.conversationId,
      userId: this.userId,
      deliveredAt: this.deliveredAt,
    };
  }
}

export class MessageDeliveredEventStrategy extends LinearVersionStrategy<MessageDeliveredEvent> {
  protected currentVersion = 1;
  protected upgradeHandlers: Record<number, (event: any) => any> = {};
  protected downgradeHandlers: Record<number, (event: any) => any> = {};
}
