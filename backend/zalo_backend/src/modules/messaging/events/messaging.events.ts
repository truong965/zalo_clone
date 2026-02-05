/**
 * MESSAGING DOMAIN EVENTS
 *
 * Owner: MessagingModule
 * Description: Events emitted during message and conversation lifecycle
 *
 * Business Rules:
 * - MessageSentEvent: New message created and ready to deliver
 * - ConversationCreatedEvent: New direct or group conversation created
 */

import { DomainEvent } from '@shared/events';
import { MessageType } from '@prisma/client';

/**
 * Emitted when a message is sent to a conversation.
 *
 * Listeners:
 * - RedisModule: Update conversation last_message cache
 * - SocketModule: Real-time delivery to connected recipients
 * - NotificationsModule: Send push notifications to offline users
 * - AnalyticsModule: Track message volume (future)
 *
 * Critical Event: YES (stored in events table for audit trail)
 *
 * @version 1
 * @example
 * ```typescript
 * const event = new MessageSentEvent(
 *   messageId: '550e8400-e29b-41d4-a716-446655440000',
 *   conversationId: '660e8400-e29b-41d4-a716-446655440111',
 *   senderId: '770e8400-e29b-41d4-a716-446655440222',
 *   content: 'Hello, how are you?',
 *   type: MessageType.TEXT,
 * );
 * ```
 */
export class MessageSentEvent extends DomainEvent {
  readonly eventType = 'MESSAGE_SENT';
  readonly version = 1;

  constructor(
    readonly messageId: string,
    readonly conversationId: string,
    readonly senderId: string,
    readonly content: string,
    readonly type: string, // MessageType enum
  ) {
    super('MessagingModule', 'Message', messageId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      messageId: this.messageId,
      conversationId: this.conversationId,
      senderId: this.senderId,
      content: this.content,
      type: this.type,
      eventType: this.eventType,
    };
  }
}

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
 * @example
 * ```typescript
 * const event = new ConversationCreatedEvent(
 *   conversationId: '660e8400-e29b-41d4-a716-446655440111',
 *   createdBy: '770e8400-e29b-41d4-a716-446655440222',
 *   type: ConversationType.DIRECT,
 *   participantIds: ['770e8400-e29b-41d4-a716-446655440222', '880e8400-e29b-41d4-a716-446655440333'],
 * );
 * ```
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
    super('MessagingModule', 'Conversation', conversationId, 1);
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
