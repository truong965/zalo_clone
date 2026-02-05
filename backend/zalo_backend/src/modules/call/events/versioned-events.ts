import { EventType, CallStatus } from '@prisma/client';
import {
  VersionedDomainEvent,
  LinearVersionStrategy,
} from '@common/events/versioned-event';

/**
 * PHASE 3.4: Versioned Call Domain Events
 *
 * Call tracking events with full versioning support
 * Version history:
 * - V1: callId, participantIds, startTime, endTime, duration, status
 * - V2 (future): Add quality metrics, recording flags, transcription
 */

// ============================================================================
// CALL_INITIATED EVENT
// ============================================================================

/**
 * V1 (Current): CallInitiatedEvent
 * Emitted when a call is initiated
 */
export class CallInitiatedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.CALL_INITIATED;

  constructor(
    readonly callId: string,
    readonly initiatorId: string,
    readonly receiverId: string,
    readonly isGroupCall: boolean,
    readonly callType: 'AUDIO' | 'VIDEO',
    correlationId?: string,
  ) {
    super(callId, 'CallModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.callId &&
      !!this.initiatorId &&
      !!this.receiverId
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      callId: this.callId,
      initiatorId: this.initiatorId,
      receiverId: this.receiverId,
      isGroupCall: this.isGroupCall,
      callType: this.callType,
    };
  }
}

export class CallInitiatedEventStrategy extends LinearVersionStrategy<CallInitiatedEvent> {
  protected currentVersion = 1;

  protected upgradeHandlers: Record<number, (event: any) => any> = {
    // V1 → V2: Add call quality baseline
    // 1: (event) => ({
    //   ...event,
    //   version: 2,
    //   qualityMetrics: { latency: 0, packetLoss: 0, jitter: 0 },
    // }),
  };

  protected downgradeHandlers: Record<number, (event: any) => any> = {
    // V2 → V1: Remove quality metrics
    // 2: (event) => {
    //   const { qualityMetrics, ...rest } = event;
    //   return { ...rest, version: 1 };
    // },
  };
}

// ============================================================================
// CALL_ACCEPTED EVENT
// ============================================================================

export class CallAcceptedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.CALL_ANSWERED;

  constructor(
    readonly callId: string,
    readonly acceptedBy: string,
    readonly acceptedAt: Date,
    correlationId?: string,
  ) {
    super(callId, 'CallModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.callId &&
      !!this.acceptedBy &&
      this.acceptedAt instanceof Date
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      callId: this.callId,
      acceptedBy: this.acceptedBy,
      acceptedAt: this.acceptedAt,
    };
  }
}

export class CallAcceptedEventStrategy extends LinearVersionStrategy<CallAcceptedEvent> {
  protected currentVersion = 1;
  protected upgradeHandlers: Record<number, (event: any) => any> = {};
  protected downgradeHandlers: Record<number, (event: any) => any> = {};
}

// ============================================================================
// CALL_REJECTED EVENT
// ============================================================================

export class CallRejectedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.CALL_REJECTED;

  constructor(
    readonly callId: string,
    readonly rejectedBy: string,
    readonly reason?: string,
    correlationId?: string,
  ) {
    super(callId, 'CallModule', 1, correlationId);
  }

  isValid(): boolean {
    return super.isValid() && !!this.callId && !!this.rejectedBy;
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      callId: this.callId,
      rejectedBy: this.rejectedBy,
      reason: this.reason,
    };
  }
}

export class CallRejectedEventStrategy extends LinearVersionStrategy<CallRejectedEvent> {
  protected currentVersion = 1;
  protected upgradeHandlers: Record<number, (event: any) => any> = {};
  protected downgradeHandlers: Record<number, (event: any) => any> = {};
}

// ============================================================================
// CALL_TERMINATED EVENT
// ============================================================================

export class CallTerminatedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.CALL_ENDED;

  constructor(
    readonly callId: string,
    readonly terminatedBy: string,
    readonly terminatedAt: Date,
    readonly duration: number, // in seconds
    readonly status: CallStatus,
    readonly participantCount: number,
    correlationId?: string,
  ) {
    super(callId, 'CallModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.callId &&
      !!this.terminatedBy &&
      this.terminatedAt instanceof Date &&
      typeof this.duration === 'number'
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      callId: this.callId,
      terminatedBy: this.terminatedBy,
      terminatedAt: this.terminatedAt,
      duration: this.duration,
      status: this.status,
      participantCount: this.participantCount,
    };
  }
}

export class CallTerminatedEventStrategy extends LinearVersionStrategy<CallTerminatedEvent> {
  protected currentVersion = 1;

  protected upgradeHandlers: Record<number, (event: any) => any> = {
    // V1 → V2: Add call recording metadata
    // 1: (event) => ({
    //   ...event,
    //   version: 2,
    //   recordingId: null,
    //   wasRecorded: false,
    // }),
  };

  protected downgradeHandlers: Record<number, (event: any) => any> = {
    // V2 → V1: Remove recording metadata
    // 2: (event) => {
    //   const { recordingId, wasRecorded, ...rest } = event;
    //   return { ...rest, version: 1 };
    // },
  };
}

// ============================================================================
// CALL_MISSED EVENT
// ============================================================================

export class CallMissedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.CALL_REJECTED;

  constructor(
    readonly callId: string,
    readonly missedBy: string,
    readonly missedAt: Date,
    readonly initiatorId: string,
    correlationId?: string,
  ) {
    super(callId, 'CallModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.callId &&
      !!this.missedBy &&
      this.missedAt instanceof Date
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      callId: this.callId,
      missedBy: this.missedBy,
      missedAt: this.missedAt,
      initiatorId: this.initiatorId,
    };
  }
}

export class CallMissedEventStrategy extends LinearVersionStrategy<CallMissedEvent> {
  protected currentVersion = 1;
  protected upgradeHandlers: Record<number, (event: any) => any> = {};
  protected downgradeHandlers: Record<number, (event: any) => any> = {};
}
