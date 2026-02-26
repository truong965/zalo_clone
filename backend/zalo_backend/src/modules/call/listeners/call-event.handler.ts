import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { CallStatus, EventType } from '@prisma/client';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { CallEndReasonType } from '../events/call.events';
import { SocketEvents } from '@common/constants/socket-events.constant';

/**
 * PHASE 3 Action 3.2: CallEventHandler (SEPARATED LISTENER)
 * PHASE 3.3: Enhanced with Idempotency Tracking
 *
 * Responsibility: ONLY handles call-related events
 * - call.ended (unified — replaces old call.terminated)
 *
 * Single Responsibility: Call history logging and notifications only
 * NO cross-cutting concerns (Socket, Messaging modules handle their own updates)
 *
 * Idempotency: All handlers track processing to prevent duplicate execution
 */

export interface CallEndedPayload {
  eventId?: string;
  callId: string;
  callType: 'VOICE' | 'VIDEO';
  initiatorId: string;
  receiverIds: string[];
  conversationId?: string;
  status: CallStatus;
  reason: CallEndReasonType;
  provider: 'WEBRTC_P2P' | 'DAILY_CO';
  durationSeconds: number;
}

@Injectable()
export class CallEventHandler {
  private readonly logger = new Logger(CallEventHandler.name);

  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  /**
   * Handle unified call.ended event
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
  @OnEvent('call.ended')
  async handleCallEnded(payload: CallEndedPayload): Promise<void> {
    const { callId, durationSeconds, status, conversationId, reason } = payload;
    // eventId must be a valid UUID (ProcessedEvent.eventId is @db.Uuid)
    // Use callId directly — it's already unique per call
    const eventId = payload.eventId || callId;
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
      `[CALL_ENDED] callId: ${callId}, duration: ${durationSeconds}s, status: ${status}, reason: ${reason}`,
    );

    try {
      // STEP 1: Create System Message in Conversation
      // Emit event for MessageModule to create CALL_LOG system message
      if (conversationId) {
        this.logger.debug(`[CALL_ENDED] Emitting call.log_message_needed for ${callId}`);
        this.eventEmitter.emit(SocketEvents.CALL_LOG_MESSAGE_NEEDED, {
          callId,
          callType: payload.callType,
          conversationId,
          initiatorId: payload.initiatorId,
          receiverIds: payload.receiverIds,
          participantCount: payload.receiverIds.length + 1,
          status,
          reason,
          durationSeconds,
        });
      }

      // STEP 2: Queue Push Notification for Missed Calls (Phase 5)
      if (
        status === CallStatus.MISSED ||
        status === CallStatus.NO_ANSWER
      ) {
        this.logger.debug(`[CALL_ENDED] Missed call — emitting push notification events for ${payload.receiverIds.length} receivers`);
        // Emit per-receiver notification so each receiver gets their own push
        const isGroupCall = payload.receiverIds.length > 1;
        for (const receiverId of payload.receiverIds) {
          this.eventEmitter.emit(SocketEvents.CALL_MISSED_NOTIFICATION_NEEDED, {
            callId,
            callType: payload.callType,
            callerId: payload.initiatorId,
            callerName: (payload as any).callerName || 'Unknown',
            callerAvatar: (payload as any).callerAvatar || null,
            calleeId: receiverId,
            isGroupCall,
            conversationId: payload.conversationId,
          });
        }
      }

      // STEP 3: Update Conversation Last Message
      // Emit event for ConversationModule to update lastMessageAt
      if (conversationId) {
        this.logger.debug(
          `[CALL_ENDED] Emitting conversation update for ${conversationId}`,
        );
        this.eventEmitter.emit(SocketEvents.CALL_CONVERSATION_UPDATE_NEEDED, {
          conversationId,
          callId,
          timestamp: new Date(),
        });
      }

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
        `[CALL_ENDED] ❌ Failed to handle call.ended event:`,
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
