/**
 * System / Logging Module Types
 *
 * Call history, socket connections and domain event log entries.
 */

import type { EventType } from './social.types';

// ============================================================================
// ENUMS
// ============================================================================

export const CallStatus = {
      COMPLETED: 'COMPLETED',
      MISSED: 'MISSED',
      REJECTED: 'REJECTED',
      CANCELLED: 'CANCELLED',
      NO_ANSWER: 'NO_ANSWER',
      FAILED: 'FAILED',
} as const;

export type CallStatus = (typeof CallStatus)[keyof typeof CallStatus];

export const CallType = {
      VOICE: 'VOICE',
      VIDEO: 'VIDEO',
} as const;

export type CallType = (typeof CallType)[keyof typeof CallType];

export const CallProvider = {
      WEBRTC_P2P: 'WEBRTC_P2P',
      DAILY_CO: 'DAILY_CO',
} as const;

export type CallProvider = (typeof CallProvider)[keyof typeof CallProvider];

// ============================================================================
// ENTITIES
// ============================================================================

export interface CallHistory {
      id: string;
      callerId: string;
      calleeId: string;
      callType: CallType;
      provider: CallProvider;
      conversationId?: string;
      duration?: number;
      status: CallStatus;
      endReason?: string;
      startedAt: string;
      endedAt?: string;
      createdAt: string;
      deletedAt?: string;
      /** Populated by backend join */
      caller?: { id: string; displayName: string; avatarUrl: string | null };
      /** Populated by backend join */
      callee?: { id: string; displayName: string; avatarUrl: string | null };
      isViewed?: boolean;
}

export interface SocketConnection {
      id: string;
      userId: string;
      socketId: string;
      deviceId: string;
      serverInstance?: string;
      ipAddress: string;
      userAgent?: string;
      connectedAt: string;
      disconnectedAt?: string;
      disconnectReason?: string;
      messagesSent: number;
      messagesReceived: number;
      duration?: number;
}

export interface DomainEvent {
      id: string;
      eventId: string;
      eventType: EventType;
      aggregateId: string;
      aggregateType: string;
      version: number;
      source: string;
      correlationId?: string;
      causationId?: string;
      payload: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      occurredAt: string;
      createdAt: string;
      issuedBy?: string;
}

export interface ProcessedEvent {
      id: string;
      eventId: string;
      eventType: EventType;
      eventVersion: number;
      handlerId: string;
      processedAt: string;
      status: string;
      errorMessage?: string;
      retryCount: number;
      correlationId?: string;
}
