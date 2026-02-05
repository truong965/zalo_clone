/**
 * MESSAGE DOMAIN EVENTS
 *
 * Owner: MessageModule
 * Description: Events emitted during message lifecycle
 *
 * Business Rules:
 * - MessageSentEvent: New message created and ready to deliver
 */

import { DomainEvent } from '@shared/events';

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
    super('MessageModule', 'Message', messageId, 1);
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
