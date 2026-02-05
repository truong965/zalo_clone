/**
 * CALL DOMAIN EVENTS
 *
 * Owner: CallModule
 * Description: Events emitted during voice/video call lifecycle
 *
 * Business Rules:
 * - CallInitiatedEvent: One user initiates call to another (or group call)
 * - CallEndedEvent: Call terminates (by either party or timeout)
 */

import { DomainEvent } from '@shared/events';

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
 * @example
 * ```typescript
 * const event = new CallInitiatedEvent(
 *   callId: '550e8400-e29b-41d4-a716-446655440000',
 *   initiatorId: '660e8400-e29b-41d4-a716-446655440111',
 *   receiverIds: ['770e8400-e29b-41d4-a716-446655440222'],
 *   type: 'VOICE',
 * );
 * ```
 */
export class CallInitiatedEvent extends DomainEvent {
  readonly eventType = 'CALL_INITIATED';
  readonly version = 1;

  constructor(
    readonly callId: string,
    readonly initiatorId: string,
    readonly receiverIds: string[], // Array to support group calls in future
    readonly type: 'VOICE' | 'VIDEO',
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
      eventType: this.eventType,
    };
  }
}

/**
 * Emitted when a call ends (successfully or not).
 *
 * Listeners:
 * - RedisModule: Clear active call cache
 * - SocketModule: Notify all participants
 * - CallModule: Save call history with duration
 * - NotificationsModule: Optional summary notification
 * - AnalyticsModule: Track call duration, quality, etc.
 *
 * Call Status:
 * - COMPLETED: Call connected and ended normally
 * - MISSED: Recipient didn't answer
 * - REJECTED: Recipient explicitly rejected
 * - CANCELLED: Caller cancelled before answer
 *
 * Critical Event: YES (billing, compliance, call history)
 *
 * @version 1
 * @example
 * ```typescript
 * const event = new CallEndedEvent(
 *   callId: '550e8400-e29b-41d4-a716-446655440000',
 *   initiatorId: '660e8400-e29b-41d4-a716-446655440111',
 *   receiverId: '770e8400-e29b-41d4-a716-446655440222',
 *   status: CallStatus.COMPLETED,
 *   durationSeconds: 300,
 * );
 * ```
 */
export class CallEndedEvent extends DomainEvent {
  readonly eventType = 'CALL_ENDED';
  readonly version = 1;

  constructor(
    readonly callId: string,
    readonly initiatorId: string,
    readonly receiverId: string,
    readonly status: 'COMPLETED' | 'MISSED' | 'REJECTED' | 'CANCELLED',
    readonly durationSeconds: number,
  ) {
    super('CallModule', 'Call', callId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      callId: this.callId,
      initiatorId: this.initiatorId,
      receiverId: this.receiverId,
      status: this.status,
      durationSeconds: this.durationSeconds,
      eventType: this.eventType,
    };
  }
}
