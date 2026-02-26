/**
 * CallNotificationListener — Push notifications for call events.
 *
 * Lives in NotificationsModule (not CallModule) to honour event-driven boundaries.
 * CallModule emits events → this listener reacts by sending push notifications.
 *
 * Events handled:
 * 1. 'call.push_notification_needed'   — incoming call push (callee offline / no ringing ack)
 * 2. 'call.missed_notification_needed'  — missed call push (call ended without answer)
 *
 * Uses IdempotencyService via event correlation to prevent duplicate pushes.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { PushNotificationService } from '../services/push-notification.service';

/** Payload emitted by CallSignalingGateway when callee needs a push */
export interface CallPushNotificationPayload {
      eventId?: string;
      callId: string;
      callType: 'VOICE' | 'VIDEO';
      callerId: string;
      callerName: string;
      callerAvatar: string | null;
      calleeId: string;
      conversationId?: string;
      reason: 'CALLEE_OFFLINE' | 'NO_RINGING_ACK';
}

/** Payload emitted by CallEventHandler for missed calls */
export interface MissedCallNotificationPayload {
      eventId?: string;
      callId: string;
      callType: 'VOICE' | 'VIDEO';
      callerId: string;
      callerName: string;
      callerAvatar: string | null;
      calleeId: string;
      /** Group call flag — drives group-aware push content */
      isGroupCall?: boolean;
      /** Conversation ID for group name lookup */
      conversationId?: string;
}

@Injectable()
export class CallNotificationListener {
      private readonly logger = new Logger(CallNotificationListener.name);

      /**
       * Track which callIds we've already sent an incoming-call push for,
       * to avoid duplicates (e.g. offline event + ack-timeout event for same call).
       * In-memory Set is sufficient — push is best-effort, not transactional.
       */
      private readonly sentIncomingPush = new Set<string>();

      constructor(
            private readonly pushService: PushNotificationService,
            private readonly prisma: PrismaService,
      ) { }

      /**
       * Handle incoming-call push request.
       * Fired when callee is offline OR when ringing_ack is not received within 2 s.
       */
      @OnEvent('call.push_notification_needed')
      async handleIncomingCallPush(payload: CallPushNotificationPayload): Promise<void> {
            if (!this.pushService.isAvailable) return;

            // Deduplicate: only send once per callId (offline + ack-timeout may both fire)
            if (this.sentIncomingPush.has(payload.callId)) {
                  this.logger.debug(
                        `[INCOMING_PUSH] Already sent for callId=${payload.callId}, skipping`,
                  );
                  return;
            }
            this.sentIncomingPush.add(payload.callId);

            // Auto-cleanup after 60 s to prevent memory leak
            setTimeout(() => this.sentIncomingPush.delete(payload.callId), 60_000);

            this.logger.log(
                  `[INCOMING_PUSH] Sending push for call ${payload.callId} (reason: ${payload.reason})`,
            );

            try {
                  await this.pushService.sendIncomingCallPush({
                        callId: payload.callId,
                        callType: payload.callType,
                        callerId: payload.callerId,
                        callerName: payload.callerName,
                        callerAvatar: payload.callerAvatar,
                        calleeId: payload.calleeId,
                        conversationId: payload.conversationId,
                  });
            } catch (error) {
                  this.logger.error(
                        `[INCOMING_PUSH] Failed for call ${payload.callId}:`,
                        error,
                  );
            }
      }

      /**
       * Handle missed-call push request.
       * Fired by CallEventHandler when call ends with MISSED / NO_ANSWER.
       */
      @OnEvent('call.missed_notification_needed')
      async handleMissedCallPush(payload: MissedCallNotificationPayload): Promise<void> {
            if (!this.pushService.isAvailable) return;

            this.logger.log(
                  `[MISSED_PUSH] Sending push for call ${payload.callId} (group=${payload.isGroupCall ?? false})`,
            );

            // Resolve group conversation name for group-aware push content
            let conversationName: string | null = null;
            if (payload.isGroupCall && payload.conversationId) {
                  try {
                        const conv = await this.prisma.conversation.findUnique({
                              where: { id: payload.conversationId },
                              select: { name: true },
                        });
                        conversationName = conv?.name ?? null;
                  } catch {
                        // Non-critical: fall back to caller name
                  }
            }

            try {
                  await this.pushService.sendMissedCallPush({
                        callId: payload.callId,
                        callType: payload.callType,
                        callerId: payload.callerId,
                        callerName: payload.callerName,
                        callerAvatar: payload.callerAvatar,
                        calleeId: payload.calleeId,
                        isGroupCall: payload.isGroupCall,
                        conversationName,
                  });
            } catch (error) {
                  this.logger.error(
                        `[MISSED_PUSH] Failed for call ${payload.callId}:`,
                        error,
                  );
            }
      }
}
