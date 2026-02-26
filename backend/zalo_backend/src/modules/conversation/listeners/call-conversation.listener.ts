/**
 * CallConversationListener
 *
 * Lives in ConversationModule. Listens to `call.conversation_update_needed`
 * events and updates `conversation.lastMessageAt` so the conversation list
 * reflects recent call activity.
 *
 * Event-driven: CallModule emits → ConversationModule listens. No direct imports.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { SocketEvents } from '@common/constants/socket-events.constant';

export interface CallConversationUpdatePayload {
      conversationId: string;
      callId: string;
      timestamp: Date;
}

@Injectable()
export class CallConversationListener {
      private readonly logger = new Logger(CallConversationListener.name);

      constructor(private readonly prisma: PrismaService) { }

      /**
       * Update conversation.lastMessageAt when a call ends in that conversation.
       */
      @OnEvent(SocketEvents.CALL_CONVERSATION_UPDATE_NEEDED)
      async handleCallConversationUpdate(payload: CallConversationUpdatePayload): Promise<void> {
            const { conversationId, callId, timestamp } = payload;

            this.logger.debug(
                  `[CALL_CONV] Updating lastMessageAt for conversation ${conversationId} (call ${callId})`,
            );

            try {
                  await this.prisma.conversation.update({
                        where: { id: conversationId },
                        data: { lastMessageAt: timestamp },
                  });

                  this.logger.log(
                        `[CALL_CONV] Conversation ${conversationId} lastMessageAt updated`,
                  );
            } catch (error) {
                  this.logger.error(
                        `[CALL_CONV] Failed to update conversation ${conversationId}:`,
                        error,
                  );
                  // Non-critical — don't throw
            }
      }
}
