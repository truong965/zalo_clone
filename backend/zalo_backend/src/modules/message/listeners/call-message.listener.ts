/**
 * CallMessageListener
 *
 * Lives in MessageModule. Listens to `call.log_message_needed` events
 * emitted by CallModule's CallEventHandler and creates a SYSTEM message
 * in the conversation so users can see the call log in chat history.
 *
 * Event-driven: CallModule emits → MessageModule listens. No direct imports.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { SocketEvents } from '@common/constants/socket-events.constant';
import { CallStatus } from '@prisma/client';
import { safeJSON } from '@common/utils/json.util';

export interface CallLogMessageNeededPayload {
      callId: string;
      callType: 'VOICE' | 'VIDEO';
      conversationId: string;
      /** Initiator / host of the call */
      initiatorId: string;
      /** All receiver user IDs */
      receiverIds: string[];
      /** Total participant count (initiator + receivers) */
      participantCount: number;
      status: CallStatus;
      reason: string;
      durationSeconds: number;
}

@Injectable()
export class CallMessageListener {
      private readonly logger = new Logger(CallMessageListener.name);

      constructor(
            private readonly prisma: PrismaService,
            private readonly eventEmitter: EventEmitter2,
      ) { }

      /**
       * Create a SYSTEM message to log the call in the conversation.
       */
      @OnEvent(SocketEvents.CALL_LOG_MESSAGE_NEEDED)
      async handleCallLogMessageNeeded(payload: CallLogMessageNeededPayload): Promise<void> {
            const {
                  callId,
                  callType,
                  conversationId,
                  initiatorId,
                  participantCount,
                  status,
                  durationSeconds,
            } = payload;

            this.logger.debug(
                  `[CALL_LOG] Creating system message for call ${callId} in conversation ${conversationId}`,
            );

            try {
                  // Build human-readable call summary
                  const content = this.buildCallLogContent(callType, status, durationSeconds, participantCount);

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

                  // Emit system-message.broadcast so ConversationGateway can broadcast to members
                  this.eventEmitter.emit('system-message.broadcast', {
                        conversationId,
                        message: safeJSON(message),
                        excludeUserIds: [],
                  });
            } catch (error) {
                  this.logger.error(
                        `[CALL_LOG] Failed to create system message for call ${callId}:`,
                        error,
                  );
                  // Non-critical — don't throw
            }
      }

      private buildCallLogContent(
            callType: 'VOICE' | 'VIDEO',
            status: CallStatus,
            durationSeconds: number,
            participantCount: number = 2,
      ): string {
            const isGroup = participantCount > 2;
            const typeLabel = callType === 'VIDEO'
                  ? (isGroup ? 'Cuộc gọi video nhóm' : 'Video')
                  : (isGroup ? 'Cuộc gọi nhóm' : 'Cuộc gọi thoại');

            switch (status) {
                  case CallStatus.COMPLETED: {
                        const mins = Math.floor(durationSeconds / 60);
                        const secs = durationSeconds % 60;
                        const durationStr = mins > 0 ? `${mins} phút ${secs} giây` : `${secs} giây`;
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
