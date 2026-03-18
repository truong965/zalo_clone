import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import type { MessageSentEvent } from '../events';
import type { ConversationCreatedEvent } from '@modules/conversation/events';
import { InternalEventNames } from '@common/contracts/events/event-names';

@Injectable()
export class MessageBroadcasterListener extends IdempotentListener {
  @OnEvent(InternalEventNames.MESSAGE_SENT)
  async handleMessageSent(event: MessageSentEvent): Promise<void> {
    return this.withIdempotency(`message-sent-${event.messageId}`, async () => {
      this.logger.debug(
        `[MessageBroadcaster] Processing message.sent event: ${event.messageId}`,
      );

      try {
        this.logger.debug(
          `[MessageBroadcaster] Processed message.sent for message ${event.messageId}`,
        );
      } catch (error) {
        this.logger.error(
          `[MessageBroadcaster] Error handling message.sent: ${(error as Error).message}`,
          (error as Error).stack,
        );
        throw error;
      }
    });
  }

  @OnEvent(InternalEventNames.CONVERSATION_CREATED)
  async handleConversationCreated(
    event: ConversationCreatedEvent,
  ): Promise<void> {
    return this.withIdempotency(
      `conversation-created-${event.conversationId}`,
      async () => {
        this.logger.debug(
          `[MessageBroadcaster] Processing conversation.created: ${event.conversationId}`,
        );

        try {
          this.logger.debug(
            `[MessageBroadcaster] Processed conversation.created for ${event.conversationId}`,
          );
        } catch (error) {
          this.logger.error(
            `[MessageBroadcaster] Error handling conversation.created: ${(error as Error).message}`,
            (error as Error).stack,
          );
          throw error;
        }
      },
    );
  }
}
