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
} as const;

export type CallStatus = (typeof CallStatus)[keyof typeof CallStatus];

// ============================================================================
// ENTITIES
// ============================================================================

export interface CallHistory {
      id: string;
      callerId: string;
      calleeId: string;
      duration?: number;
      status: CallStatus;
      startedAt: string;
      endedAt?: string;
      createdAt: string;
      deletedAt?: string;
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
