import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import type { MessageSentEvent } from '@shared/events';

/**
 * PHASE 2: Socket Integration via Events
 *
 * Listens to messaging events and processes them for Socket module.
 * This breaks the coupling: SocketModule ← MessagingModule
 *
 * BEFORE: MessagingService directly calls SocketService/SocketGateway
 * AFTER: MessagingService emits events, SocketNotificationListener reacts
 *
 * Event Subscriptions:
 * - message.sent: Broadcast message to conversation participants
 * - conversation.created: Notify members about new conversation
 *
 * Benefits:
 * - Zero module coupling
 * - Independent testing of both modules
 * - Ready for async event brokers in PHASE 5
 */
@Injectable()
export class SocketNotificationListener extends IdempotentListener {
  /**
   * Handle MessageSentEvent
   * Broadcast message to conversation participants via WebSocket
   *
   * PHASE 2 NOTE: Direct socket broadcasting implementation deferred.
   * Currently marks event as processed and logged for monitoring.
   * Actual broadcasting will use SocketGateway.server.to(room).emit() pattern.
   */
  @OnEvent('message.sent')
  async handleMessageSent(event: MessageSentEvent): Promise<void> {
    return this.withIdempotency(`message-sent-${event.messageId}`, async () => {
      this.logger.debug(
        `[SocketNotif] Processing message.sent event: ${event.messageId}`,
      );

      try {
        // TODO PHASE 3: Implement socket broadcasting
        // - Get conversation room: `conversation:${event.conversationId}`
        // - Broadcast to room: this.socketGateway.server.to(room).emit('message.new', {...})
        // - Skip sender to avoid duplicates
        // - Handle offline clients with presence tracking

        this.logger.debug(
          `[SocketNotif] Processed message.sent for message ${event.messageId}`,
        );
      } catch (error) {
        this.logger.error(
          `[SocketNotif] Error handling message.sent: ${error.message}`,
          error.stack,
        );
        throw error;
      }
    });
  }

  /**
   * Handle ConversationCreatedEvent
   * Notify members about new conversation creation
   */
  @OnEvent('conversation.created')
  async handleConversationCreated(event: any): Promise<void> {
    return this.withIdempotency(
      `conversation-created-${event.conversationId}`,
      async () => {
        this.logger.debug(
          `[SocketNotif] Processing conversation.created: ${event.conversationId}`,
        );

        try {
          // TODO PHASE 3: Implement conversation notification
          // - Iterate conversation members
          // - Emit 'conversation.new' event to each member's sockets
          // - Update conversation list in real-time

          this.logger.debug(
            `[SocketNotif] Processed conversation.created for ${event.conversationId}`,
          );
        } catch (error) {
          this.logger.error(
            `[SocketNotif] Error handling conversation.created: ${error.message}`,
            error.stack,
          );
          throw error;
        }
      },
    );
  }
}
