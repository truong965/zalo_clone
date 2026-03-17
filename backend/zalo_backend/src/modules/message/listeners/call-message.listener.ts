/**
 * CallMessageListener
 *
 * Lives in MessageModule. Listens directly to `call.ended` domain event
 * and creates a SYSTEM message in the conversation so users can see the
 * call log in chat history.
 *
 * Choreography Pattern: Listens to `call.ended` directly — no middleman.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { CallStatus, EventType } from '@prisma/client';
import { safeJSON } from '@common/utils/json.util';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { CONVERSATION_SYSTEM_MESSAGE_PORT } from '@common/contracts/internal-api';
import type { IConversationSystemMessagePort } from '@common/contracts/internal-api';
import type { CallEndedPayload } from '@modules/call/events';

@Injectable()
export class CallMessageListener {
  private readonly logger = new Logger(CallMessageListener.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONVERSATION_SYSTEM_MESSAGE_PORT)
    private readonly systemMessagePort: IConversationSystemMessagePort,
    private readonly idempotency: IdempotencyService,
  ) { }

  /**
   * Create a SYSTEM message to log the call in the conversation.
   * Precondition: conversationId must exist.
   */
  @OnEvent('call.ended', { async: true })
  async handleCallEnded(payload: CallEndedPayload): Promise<void> {
    const { conversationId } = payload;

    // Precondition: only create call log if call had a conversation
    if (!conversationId) return;

    const {
      callId,
      callType,
      initiatorId,
      receiverIds,
      status,
      durationSeconds,
    } = payload;
    const eventId = payload.eventId || callId;
    const handlerId = 'CallMessageListener';

    try {
      // Idempotency check
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );
      if (alreadyProcessed) {
        this.logger.debug(`[CALL_LOG] Skipping duplicate: ${eventId}`);
        return;
      }
    } catch (error) {
      this.logger.warn(
        `[CALL_LOG] Idempotency check failed, proceeding`,
        error,
      );
    }

    try {
      const participantCount = (receiverIds?.length ?? 0) + 1;
      const content = this.buildCallLogContent(
        callType ?? 'VOICE',
        status,
        durationSeconds,
        participantCount,
      );

      const message = await this.prisma.message.create({
        data: {
          conversationId,
          senderId: initiatorId,
          type: 'SYSTEM',
          content,
          metadata: {
            action: 'CALL_LOG',
            callId,
            callType,
            status,
            durationSeconds,
          },
        },
      });

      this.logger.log(
        `[CALL_LOG] System message ${message.id} created for call ${callId}`,
      );

      await this.systemMessagePort.broadcast({
        conversationId,
        message: safeJSON(message),
        excludeUserIds: [],
      });

      // Record successful processing
      try {
        await this.idempotency.recordProcessed(
          eventId,
          handlerId,
          EventType.CALL_ENDED,
        );
      } catch (recordErr) {
        this.logger.warn(`[CALL_LOG] Failed to record idempotency`, recordErr);
      }
    } catch (error) {
      this.logger.error(
        `[CALL_LOG] Failed to create system message for call ${callId}:`,
        error,
      );
      try {
        await this.idempotency.recordError(
          payload.eventId || callId,
          handlerId,
          error as Error,
          EventType.CALL_ENDED,
        );
      } catch {
        /* swallow */
      }
    }
  }

  private buildCallLogContent(
    callType: 'VOICE' | 'VIDEO',
    status: CallStatus,
    durationSeconds: number,
    participantCount: number = 2,
  ): string {
    const isGroup = participantCount > 2;
    const typeLabel =
      callType === 'VIDEO'
        ? isGroup
          ? 'Cuộc gọi video nhóm'
          : 'Video'
        : isGroup
          ? 'Cuộc gọi nhóm'
          : 'Cuộc gọi thoại';

    switch (status) {
      case CallStatus.COMPLETED: {
        const mins = Math.floor(durationSeconds / 60);
        const secs = durationSeconds % 60;
        const durationStr =
          mins > 0 ? `${mins} phút ${secs} giây` : `${secs} giây`;
        if (isGroup) {
          return `${typeLabel} · ${participantCount} người tham gia · ${durationStr}`;
        }
        return `${typeLabel} - ${durationStr}`;
      }
      case CallStatus.MISSED:
        return `${typeLabel} nhỡ`;
      case CallStatus.NO_ANSWER:
        return `${typeLabel} không trả lời`;
      case CallStatus.REJECTED:
        return `${typeLabel} bị từ chối`;
      case CallStatus.CANCELLED:
        return `${typeLabel} đã hủy`;
      case CallStatus.FAILED:
        return `${typeLabel} thất bại`;
      default:
        return `${typeLabel}`;
    }
  }
}
