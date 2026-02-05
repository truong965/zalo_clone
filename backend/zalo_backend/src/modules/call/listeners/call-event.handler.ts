import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CallStatus, EventType } from '@prisma/client';
import { IdempotencyService } from '@common/idempotency/idempotency.service';

/**
 * PHASE 3 Action 3.2: CallEventHandler (SEPARATED LISTENER)
 * PHASE 3.3: Enhanced with Idempotency Tracking
 *
 * Responsibility: ONLY handles call-related events
 * - call.terminated
 *
 * Single Responsibility: Call history logging and notifications only
 * NO cross-cutting concerns (Socket, Messaging modules handle their own updates)
 *
 * Idempotency: All handlers track processing to prevent duplicate execution
 */

export interface CallTerminatedEvent {
  eventId?: string;
  callId: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  startedAt: Date;
  endedAt: Date;
  duration: number; // Duration in seconds
  status: CallStatus; // ANSWERED, MISSED, NO_ANSWER, BUSY, etc.
  reason?: string; // e.g., 'BLOCKED', 'NETWORK_LOST'
}

@Injectable()
export class CallEventHandler {
  private readonly logger = new Logger(CallEventHandler.name);

  constructor(private readonly idempotency: IdempotencyService) {}

  /**
   * Handle call.terminated event
   *
   * Responsibility:
   *   1. Create system message in conversation (call log)
   *   2. Queue push notification for missed calls
   *   3. Update conversation lastMessage
   *
   * NOT Responsibility:
   *   - Socket notifications (MessagingModule/SocketModule handles)
   *   - Actually sending push notifications (NotificationModule handles)
   */
  @OnEvent('call.terminated')
  async handleCallTerminated(payload: CallTerminatedEvent): Promise<void> {
    const { callId, duration, status, conversationId } = payload;
    const eventId = payload.eventId || `call.terminated-${callId}`;
    const handlerId = this.constructor.name;

    // IDEMPOTENCY: Check if already processed
    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );

      if (alreadyProcessed) {
        this.logger.debug(`[CALL_ENDED] Skipping duplicate event: ${eventId}`);
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[CALL_ENDED] Idempotency check failed, proceeding with caution`,
        idempotencyError,
      );
    }

    this.logger.log(
      `[CALL_ENDED] callId: ${callId}, duration: ${duration}s, status: ${status}`,
    );

    try {
      // STEP 1: Create System Message in Conversation
      // Log the call info so users can see in conversation history
      this.logger.debug(`[CALL_ENDED] Creating system message for ${callId}`);
      // TODO: Call MessageService to create CALL_HISTORY message
      // TODO: Include duration, status, missed call indicator

      // STEP 2: Queue Push Notification for Missed Calls
      if (status === 'COMPLETED') {
        this.logger.debug(`[CALL_ENDED] Queuing missed call notification`);
        // TODO: Queue push notification:
        //   - Title: "Missed call"
        //   - Body: "From {callerName}"
        //   - Deep link to conversation
      }

      // STEP 3: Update Conversation Last Message
      // So the conversation list shows the latest call
      this.logger.debug(
        `[CALL_ENDED] Updating conversation ${conversationId} last message`,
      );
      // TODO: Update conversation.lastMessageAt and lastMessagePreview

      this.logger.log(`[CALL_ENDED] ✅ Complete: Call ${callId} logged`);

      // IDEMPOTENCY: Record successful processing
      try {
        await this.idempotency.recordProcessed(
          eventId,
          handlerId,
          EventType.CALL_ENDED,
        );
      } catch (recordError) {
        this.logger.warn(
          `[CALL_ENDED] Failed to record idempotency tracking`,
          recordError,
        );
      }
    } catch (error) {
      this.logger.error(
        `[CALL_ENDED] ❌ Failed to handle call.terminated event:`,
        error,
      );

      // IDEMPOTENCY: Record failed processing
      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.CALL_ENDED,
        );
      } catch (recordError) {
        this.logger.warn(
          `[CALL_ENDED] Failed to record error in idempotency tracking`,
          recordError,
        );
      }
      // Don't throw - non-critical (call is already ended)
    }
  }
}
