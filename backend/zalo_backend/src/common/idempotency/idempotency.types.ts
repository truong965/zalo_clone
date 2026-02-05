/**
 * PHASE 3.3: Idempotency Types
 *
 * Type definitions for idempotency tracking
 */

/**
 * Processing status for events
 */
export enum ProcessingStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

/**
 * Processed event record
 * Tracks which handler processed which event
 */
export interface ProcessedEventRecord {
  id: string;
  eventId: string;
  handlerId: string;
  processedAt: Date;
  status: ProcessingStatus | string;
  errorMessage?: string | null;
  retryCount: number;
  correlationId?: string | null;
}

/**
 * Event with idempotency support
 * All events should include eventId for idempotency tracking
 */
export interface IdempotentEvent {
  eventId: string;
  [key: string]: any;
}

/**
 * Idempotency check result
 */
export interface IdempotencyCheckResult {
  isProcessed: boolean;
  previousStatus?: ProcessingStatus | string;
  previousErrorMessage?: string;
  retryCount?: number;
}

/**
 * Processing statistics
 */
export interface ProcessingStats {
  totalEvents: number;
  successfulEvents: number;
  failedEvents: number;
  averageRetries: number;
  lastProcessedAt: Date;
}
