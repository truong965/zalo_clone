import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import type { MessageSentEvent } from '@modules/message/events';
import type { ConversationCreatedEvent } from '@modules/conversation/events';

@Injectable()
export class SocketNotificationListener extends IdempotentListener {
  // @OnEvent('message.sent')
  // async handleMessageSent(event: MessageSentEvent): Promise<void> {
  //   return this.withIdempotency(`message-sent-${event.messageId}`, async () => {
  //     this.logger.debug(
  //       `[SocketNotif] Processing message.sent event: ${event.messageId}`,
  //     );

  //     this.logger.debug(
  //       `[SocketNotif] Processed message.sent for message ${event.messageId}`,
  //     );
  //   });
  // }

  // @OnEvent('conversation.created')
  // async handleConversationCreated(event: ConversationCreatedEvent): Promise<void> {
  //   return this.withIdempotency(
  //     `conversation-created-${event.conversationId}`,
  //     async () => {
  //       this.logger.debug(
  //         `[SocketNotif] Processing conversation.created: ${event.conversationId}`,
  //       );

  //       this.logger.debug(
  //         `[SocketNotif] Processed conversation.created for ${event.conversationId}`,
  //       );
  //     },
  //   );
  // }
}
