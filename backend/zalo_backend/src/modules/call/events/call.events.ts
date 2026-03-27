/**
 * CALL DOMAIN EVENTS
 *
 * Owner: CallModule
 * Description: Events emitted during voice/video call lifecycle
 *
 * Business Rules:
 * - CallInitiatedEvent: One user initiates call to another (or group call)
 * - CallEndedEvent: Call terminates (by either party or timeout) — UNIFIED event
 *   replaces both the old call.ended and call.terminated events
 */

import { DomainEvent } from '@shared/events';
import { CallStatus } from '@prisma/client';

/**
 * End-reason constants for call termination.
 * Stored in CallHistory.endReason and carried in CallEndedEvent.reason.
 */
export const CallEndReason = {
  USER_HANGUP: 'USER_HANGUP',
  BLOCKED: 'BLOCKED',
  TIMEOUT: 'TIMEOUT',
  NETWORK_DROP: 'NETWORK_DROP',
  REJECTED: 'REJECTED',
  NO_ANSWER: 'NO_ANSWER',
  RELATIONSHIP_CHANGED: 'RELATIONSHIP_CHANGED',
  PRIVACY_RESTRICTED: 'PRIVACY_RESTRICTED',
} as const;

export type CallEndReasonType =
  (typeof CallEndReason)[keyof typeof CallEndReason];

/**
 * Payload shape received by listeners of `call.ended`.
 * Matches the fields emitted by EventPublisher after publishing CallEndedEvent.
 */
export interface CallEndedPayload {
  eventId?: string;
  callId: string;
  callType?: 'VOICE' | 'VIDEO';
  initiatorId: string;
  receiverIds: string[];
  conversationId?: string;
  status: CallStatus;
  reason: CallEndReasonType;
  provider?: 'WEBRTC_P2P' | 'DAILY_CO';
  durationSeconds: number;
}

/**
 * Emitted when User A initiates a call to User B (or group).
 *
 * Listeners:
 * - SocketModule: Real-time call notification to callees
 * - RedisModule: Cache active call state
 * - NotificationsModule: Send push notification to offline recipients
 *
 * Call Types:
 * - VOICE: Audio-only call
 * - VIDEO: Audio + video call
 *
 * Critical Event: YES (billing, analytics, compliance)
 *
 * @version 1
 */
export class CallInitiatedEvent extends DomainEvent {
  readonly eventType = 'CALL_INITIATED';
  readonly version = 1;

  constructor(
    readonly callId: string,
    readonly initiatorId: string,
    readonly receiverIds: string[], // Array to support group calls in future
    readonly type: 'VOICE' | 'VIDEO',
    readonly conversationId?: string,
    readonly provider?: 'WEBRTC_P2P' | 'DAILY_CO',
  ) {
    super('CallModule', 'Call', callId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      callId: this.callId,
      initiatorId: this.initiatorId,
      receiverIds: this.receiverIds,
      type: this.type,
      conversationId: this.conversationId,
      provider: this.provider,
      eventType: this.eventType,
    };
  }
}

/**
 * UNIFIED event emitted when a call ends (successfully or not).
 *
 * Replaces both the old `call.ended` and `call.terminated` events.
 * All call terminations — user hangup, block, timeout, network drop —
 * now go through this single event with a `reason` field.
 *
 * Listeners (Choreography — all listen directly to call.ended):
 * - SocketModule (CallEndedSocketListener): Notify all participants
 * - MessageModule (CallMessageListener): Create CALL_LOG system message
 * - NotificationsModule (CallNotificationListener): Missed call push
 * - ConversationModule (CallConversationListener): Update lastMessageAt
 * - AdminModule (StatsCounterListener): Track call stats
 *
 * Critical Event: YES (billing, compliance, call history)
 *
 * @version 2
 */
export class CallEndedEvent extends DomainEvent {
  readonly eventType = 'CALL_ENDED';
  readonly version = 2;

  constructor(
    readonly callId: string,
    readonly callType: 'VOICE' | 'VIDEO' | undefined,
    readonly initiatorId: string,
    readonly receiverIds: string[],
    readonly conversationId: string | undefined,
    readonly status: CallStatus,
    readonly reason: CallEndReasonType,
    readonly provider: 'WEBRTC_P2P' | 'DAILY_CO' | undefined,
    readonly durationSeconds: number,
  ) {
    super('CallModule', 'Call', callId, 2);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      callId: this.callId,
      callType: this.callType,
      initiatorId: this.initiatorId,
      receiverIds: this.receiverIds,
      conversationId: this.conversationId,
      status: this.status,
      reason: this.reason,
      provider: this.provider,
      durationSeconds: this.durationSeconds,
      eventType: this.eventType,
    };
  }
}
