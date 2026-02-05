import { Injectable, Logger } from '@nestjs/common';
import { EventType } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';

/**
 * PHASE 3.3: IdempotencyService
 *
 * Core service for event idempotency tracking
 * Ensures that event handlers don't process the same event twice
 *
 * Usage:
 *   1. Check if event was already processed: isProcessed(eventId, handlerId)
 *   2. Record successful processing: recordProcessed(eventId, handlerId, eventType)
 *   3. Record failed processing: recordError(eventId, handlerId, error, eventType)
 *   4. Get processing history: getProcessingHistory(eventId)
 *
 * Database: Stores records in ProcessedEvent table
 * Unique constraint: (eventId, handlerId) - one record per handler per event
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if an event was already processed by a specific handler
   *
   * Returns true if:
   *   - Record exists with (eventId, handlerId)
   *   - status is SUCCESS
   *
   * Returns false if:
   *   - No record found (first time)
   *   - Previous attempt failed (can retry)
   */
  async isProcessed(eventId: string, handlerId: string): Promise<boolean> {
    const processed = await this.prisma.processedEvent.findUnique({
      where: {
        eventId_handlerId: {
          eventId,
          handlerId,
        },
      },
    });

    if (!processed) {
      this.logger.debug(
        `[IDEMPOTENCY] Event not processed yet: ${eventId} by ${handlerId}`,
      );
      return false;
    }

    const isSuccessful = processed.status === 'SUCCESS';

    if (isSuccessful) {
      this.logger.debug(
        `[IDEMPOTENCY] Event already processed successfully: ${eventId} by ${handlerId}`,
      );
    } else {
      this.logger.warn(
        `[IDEMPOTENCY] Event processed with status ${processed.status}: ${eventId} by ${handlerId}`,
      );
    }

    return isSuccessful;
  }

  /**
   * Record successful processing of an event by a handler
   *
   * Creates or updates ProcessedEvent record with:
   *   - status: SUCCESS
   *   - processedAt: current timestamp
   *   - retryCount: incremented if retrying
   */
  async recordProcessed(
    eventId: string,
    handlerId: string,
    eventType: EventType,
    correlationId?: string,
    eventVersion: number = 1,
  ): Promise<void> {
    try {
      await this.prisma.processedEvent.upsert({
        where: {
          eventId_handlerId: {
            eventId,
            handlerId,
          },
        },
        create: {
          eventId,
          handlerId,
          eventType,
          status: 'SUCCESS',
          correlationId,
          eventVersion,
        },
        update: {
          status: 'SUCCESS',
          errorMessage: null,
          eventVersion,
          processedAt: new Date(),
        },
      });

      this.logger.log(
        `[IDEMPOTENCY] ✅ Recorded processed: ${eventId} by ${handlerId}`,
      );
    } catch (error) {
      this.logger.error(
        `[IDEMPOTENCY] ❌ Failed to record processed event: ${eventId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Record failed processing of an event by a handler
   *
   * Creates or updates ProcessedEvent record with:
   *   - status: FAILED
   *   - errorMessage: error message
   *   - retryCount: incremented
   *   - eventVersion: PHASE 3.4 event versioning support
   */
  async recordError(
    eventId: string,
    handlerId: string,
    error: Error | string,
    eventType: EventType,
    retryCount?: number,
    eventVersion: number = 1,
  ): Promise<void> {
    const errorMessage =
      typeof error === 'string' ? error : error.message || 'Unknown error';

    try {
      const existing = await this.prisma.processedEvent.findUnique({
        where: {
          eventId_handlerId: {
            eventId,
            handlerId,
          },
        },
      });

      const newRetryCount = retryCount ?? (existing?.retryCount ?? 0) + 1;

      await this.prisma.processedEvent.upsert({
        where: {
          eventId_handlerId: {
            eventId,
            handlerId,
          },
        },
        create: {
          eventId,
          handlerId,
          eventType,
          status: 'FAILED',
          errorMessage,
          retryCount: newRetryCount,
          eventVersion,
        },
        update: {
          status: 'FAILED',
          errorMessage,
          retryCount: newRetryCount,
          eventVersion,
          processedAt: new Date(),
        },
      });

      this.logger.warn(
        `[IDEMPOTENCY] ⚠️ Recorded failed: ${eventId} by ${handlerId} (attempt ${newRetryCount})`,
      );
    } catch (err) {
      this.logger.error(
        `[IDEMPOTENCY] ❌ Failed to record error: ${eventId}`,
        err,
      );
      throw err;
    }
  }

  /**
   * Check if a handler can retry processing an event
   *
   * Returns true if:
   *   - No record exists (first attempt)
   *   - Previous attempt failed AND retryCount < maxRetries
   *
   * Returns false if:
   *   - Already succeeded (idempotent)
   *   - Already failed and exceeded maxRetries
   */
  async canRetry(
    eventId: string,
    handlerId: string,
    maxRetries: number = 3,
  ): Promise<boolean> {
    const processed = await this.prisma.processedEvent.findUnique({
      where: {
        eventId_handlerId: {
          eventId,
          handlerId,
        },
      },
    });

    // No record = first attempt, can proceed
    if (!processed) {
      return true;
    }

    // Already succeeded = skip (idempotent)
    if (processed.status === 'SUCCESS') {
      this.logger.debug(
        `[IDEMPOTENCY] Cannot retry: already processed successfully`,
      );
      return false;
    }

    // Failed but can retry
    if (processed.status === 'FAILED' && processed.retryCount < maxRetries) {
      this.logger.debug(
        `[IDEMPOTENCY] Can retry: ${processed.retryCount}/${maxRetries}`,
      );
      return true;
    }

    // Exceeded max retries
    this.logger.warn(
      `[IDEMPOTENCY] Cannot retry: exceeded maxRetries (${processed.retryCount}/${maxRetries})`,
    );
    return false;
  }

  /**
   * Get processing history for an event
   *
   * Returns all ProcessedEvent records for the given eventId
   * Useful for debugging and audit trail
   */
  async getProcessingHistory(eventId: string) {
    return this.prisma.processedEvent.findMany({
      where: { eventId },
      orderBy: { processedAt: 'desc' },
    });
  }

  /**
   * Get processing history for a specific handler
   *
   * Returns all ProcessedEvent records for the given handlerId
   * Useful for monitoring handler performance
   */
  async getHandlerHistory(handlerId: string, limit: number = 100) {
    return this.prisma.processedEvent.findMany({
      where: { handlerId },
      orderBy: { processedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get failed processing attempts (for alerting/monitoring)
   *
   * Returns all ProcessedEvent records with status FAILED
   * within the specified time window
   */
  async getFailedAttempts(sinceHours: number = 24) {
    const sinceTime = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    return this.prisma.processedEvent.findMany({
      where: {
        status: 'FAILED',
        processedAt: {
          gte: sinceTime,
        },
      },
      orderBy: { processedAt: 'desc' },
    });
  }

  /**
   * Clear old processed event records (for maintenance)
   *
   * Only deletes successful records older than retentionDays
   * Keeps failed records for longer (for debugging)
   */
  async cleanup(successRetentionDays: number = 30) {
    const beforeDate = new Date(
      Date.now() - successRetentionDays * 24 * 60 * 60 * 1000,
    );

    try {
      const deleted = await this.prisma.processedEvent.deleteMany({
        where: {
          status: 'SUCCESS',
          processedAt: {
            lt: beforeDate,
          },
        },
      });

      this.logger.log(
        `[IDEMPOTENCY] Cleaned up ${deleted.count} old successful records`,
      );
      return deleted.count;
    } catch (error) {
      this.logger.error('[IDEMPOTENCY] Cleanup failed', error);
      throw error;
    }
  }
}
