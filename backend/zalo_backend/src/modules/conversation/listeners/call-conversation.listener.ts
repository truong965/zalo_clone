/**
 * CallConversationListener
 *
 * Lives in ConversationModule. Listens directly to `call.ended` domain event
 * and updates `conversation.lastMessageAt` so the conversation list reflects
 * recent call activity.
 *
 * Choreography Pattern: Listens to `call.ended` directly — no middleman.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import type { CallEndedPayload } from '@modules/call/events';

@Injectable()
export class CallConversationListener {
      private readonly logger = new Logger(CallConversationListener.name);

      constructor(
            private readonly prisma: PrismaService,
            private readonly idempotency: IdempotencyService,
      ) { }

      /**
       * Update conversation.lastMessageAt when a call ends in that conversation.
       * Precondition: conversationId must exist.
       */
      @OnEvent('call.ended', { async: true })
      async handleCallEnded(payload: CallEndedPayload): Promise<void> {
            const { conversationId, callId } = payload;

            // Precondition: only update if call had a conversation
            if (!conversationId) return;

            const eventId = payload.eventId || callId;
            const handlerId = 'CallConversationListener';

            try {
                  const alreadyProcessed = await this.idempotency.isProcessed(eventId, handlerId);
                  if (alreadyProcessed) {
                        this.logger.debug(`[CALL_CONV] Skipping duplicate: ${eventId}`);
                        return;
                  }
            } catch (error) {
                  this.logger.warn(`[CALL_CONV] Idempotency check failed, proceeding`, error);
            }

            try {
                  await this.prisma.conversation.update({
                        where: { id: conversationId },
                        data: { lastMessageAt: new Date() },
                  });

                  this.logger.log(`[CALL_CONV] Conversation ${conversationId} lastMessageAt updated`);

                  try {
                        await this.idempotency.recordProcessed(eventId, handlerId, EventType.CALL_ENDED);
                  } catch (recordErr) {
                        this.logger.warn(`[CALL_CONV] Failed to record idempotency`, recordErr);
                  }
            } catch (error) {
                  this.logger.error(`[CALL_CONV] Failed to update conversation ${conversationId}:`, error);
                  try {
                        await this.idempotency.recordError(eventId, handlerId, error as Error, EventType.CALL_ENDED);
                  } catch { /* swallow */ }
            }
      }
}
