/**
 * CallNotificationListener — Push notifications for call events.
 *
 * Lives in NotificationsModule (not CallModule) to honour event-driven boundaries.
 * CallModule emits events → this listener reacts by sending push notifications.
 *
 * Events handled:
 * 1. 'call.push_notification_needed'  — incoming call push (callee offline / no ringing ack)
 * 2. 'call.ended'                      — missed call push (MISSED / NO_ANSWER only)
 *
 * Choreography Pattern: Listens to `call.ended` directly — no middleman.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CallStatus, EventType } from '@prisma/client';
import { PrismaService } from '@database/prisma.service';
import { PushNotificationService } from '../services/push-notification.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import type { CallEndedPayload } from '@modules/call/events';
import { InternalEventNames } from '@common/contracts/events/event-names';

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

@Injectable()
export class CallNotificationListener {
  private readonly logger = new Logger(CallNotificationListener.name);

  /**
   * Track which (callId, calleeId) pairs we've already sent a push for,
   * to avoid duplicates (e.g. offline event + ack-timeout event for same callee).
   * Keyed by `callId:calleeId` so group calls can push to each offline
   * receiver independently.
   * In-memory Set is sufficient — push is best-effort, not transactional.
   */
  private readonly sentIncomingPush = new Set<string>();

  constructor(
    private readonly pushService: PushNotificationService,
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Handle incoming-call push request.
   * Fired when callee is offline OR when ringing_ack is not received within 2 s.
   */
  @OnEvent(InternalEventNames.CALL_PUSH_NOTIFICATION_NEEDED, { async: true })
  async handleIncomingCallPush(
    payload: CallPushNotificationPayload,
  ): Promise<void> {
    if (!this.pushService.isAvailable) return;

    // Deduplicate per (callId, calleeId) — for group calls, each offline
    // receiver must get their own push, but the same receiver shouldn't
    // get two (e.g. offline event + ack-timeout event).
    const dedupKey = `${payload.callId}:${payload.calleeId}`;
    if (this.sentIncomingPush.has(dedupKey)) {
      this.logger.debug(
        `[INCOMING_PUSH] Already sent for callId=${payload.callId} calleeId=${payload.calleeId.slice(0, 8)}…, skipping`,
      );
      return;
    }
    this.sentIncomingPush.add(dedupKey);

    // Auto-cleanup after 60 s to prevent memory leak
    setTimeout(() => this.sentIncomingPush.delete(dedupKey), 60_000);

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
   * Handle missed-call push notification.
   * Listens directly to call.ended — only acts when status is MISSED or NO_ANSWER.
   * Loops per-receiver and queries callerName/callerAvatar from DB.
   */
  @OnEvent(InternalEventNames.CALL_ENDED, { async: true })
  async handleMissedCallPush(payload: CallEndedPayload): Promise<void> {
    // Precondition: only handle missed/unanswered calls
    if (
      payload.status !== CallStatus.MISSED &&
      payload.status !== CallStatus.NO_ANSWER
    )
      return;
    if (!this.pushService.isAvailable) return;

    const { callId, callType, initiatorId, receiverIds, conversationId } =
      payload;
    const isGroupCall = (receiverIds?.length ?? 0) > 1;

    // Query caller info from DB (not available in CallEndedPayload)
    let callerName = 'Unknown';
    let callerAvatar: string | null = null;
    try {
      const caller = await this.prisma.user.findUnique({
        where: { id: initiatorId },
        select: { displayName: true, avatarUrl: true },
      });
      if (caller) {
        callerName = caller.displayName ?? 'Unknown';
        callerAvatar = caller.avatarUrl ?? null;
      }
    } catch {
      // Non-critical: fall back to defaults
    }

    // Resolve group conversation name for group-aware push content
    let conversationName: string | null = null;
    if (isGroupCall && conversationId) {
      try {
        const conv = await this.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { name: true },
        });
        conversationName = conv?.name ?? null;
      } catch {
        // Non-critical: fall back to caller name
      }
    }

    // Emit per-receiver so each gets their own push + idempotency
    for (const receiverId of receiverIds) {
      const eventId = payload.eventId || callId;
      const handlerId = `CallNotificationListener:${callId}:${receiverId}`;

      try {
        const alreadyProcessed = await this.idempotency.isProcessed(
          eventId,
          handlerId,
        );
        if (alreadyProcessed) {
          this.logger.debug(
            `[MISSED_PUSH] Skipping duplicate: ${callId} → ${receiverId.slice(0, 8)}…`,
          );
          continue;
        }
      } catch {
        // Idempotency check failed — proceed with caution
      }

      try {
        await this.pushService.sendMissedCallPush({
          callId,
          callType: callType ?? 'VOICE',
          callerId: initiatorId,
          callerName,
          callerAvatar,
          calleeId: receiverId,
          isGroupCall,
          conversationName,
        });

        try {
          await this.idempotency.recordProcessed(
            eventId,
            handlerId,
            EventType.CALL_ENDED,
          );
        } catch {
          /* swallow */
        }
      } catch (error) {
        this.logger.error(
          `[MISSED_PUSH] Failed for call ${callId} → receiver ${receiverId.slice(0, 8)}…:`,
          error,
        );
        try {
          await this.idempotency.recordError(
            eventId,
            handlerId,
            error as Error,
            EventType.CALL_ENDED,
          );
        } catch {
          /* swallow */
        }
      }
    }
  }
}
