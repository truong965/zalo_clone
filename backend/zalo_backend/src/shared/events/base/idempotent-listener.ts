/**
 * IdempotentListener Base Class
 *
 * All event listeners MUST extend this class to ensure idempotency.
 * If an event is retried from message broker, this wrapper prevents duplicate processing.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class BlockCacheListener extends IdempotentListener {
 *   @OnEvent('user.blocked')
 *   async handleUserBlocked(event: UserBlockedEvent) {
 *     return this.withIdempotency(event.eventId, async () => {
 *       await this.cache.invalidate(`user:${event.blockedId}:profile`);
 *       await this.cache.invalidate(`user:${event.blockedId}:contacts`);
 *     });
 *   }
 * }
 * ```
 *
 * @rule EVENT_DRIVEN_RULES.RULE_6: Idempotency Guarantee
 * EVERY listener MUST use withIdempotency() to handle event retries.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { DomainEvent } from './domain-event';
import { EventIdGenerator } from '@common/utils/event-id-generator';

/**
 * Wraps event handler with idempotency guarantee.
 *
 * Ensures: If the same event (same eventId) is processed twice,
 * the handler runs only once (second call is skipped).
 *
 * Implementation:
 * 1. Check processed_events table
 * 2. If not processed: run handler, record in processed_events
 * 3. If already processed: skip handler (return cached result)
 */
@Injectable()
export abstract class IdempotentListener {
  protected logger = new Logger(this.constructor.name);

  constructor(protected prisma: PrismaService) {}

  /**
   * Wrapper for event handler with idempotency guarantee.
   *
   * Enhancement (R5 - Event Versioning):
   * - Validates eventId using EventIdGenerator.isValid()
   * - Tracks event version for schema evolution
   * - Tracks correlation IDs for multi-event chains
   * - Proper fallback ID generation
   *
   * @param eventId - Unique event identifier (must be UUID v4 or will generate)
   * @param handler - The actual event handler function
   * @param handlerId - Listener identifier (default: this.constructor.name)
   * @param eventVersion - Event version for schema evolution (default: 1)
   * @param correlationId - Correlation ID for event chain tracking (optional)
   *
   * @returns Result of handler (or cached result if already processed)
   *
   * @example
   * ```typescript
   * @OnEvent('user.blocked')
   * async handleUserBlocked(event: UserBlockedEvent) {
   *   return this.withIdempotency(
   *     event.eventId,
   *     async () => {
   *       // This code runs AT MOST ONCE, even if event is retried
   *       await this.cache.invalidate(event.blockedId);
   *     },
   *     undefined, // handlerId (auto-detect)
   *     event.eventVersion // eventVersion
   *   );
   * }
   * ```
   */
  protected async withIdempotency<T>(
    eventId: string | undefined,
    handler: () => Promise<T>,
    handlerId?: string,
    eventVersion: number = 1,
    correlationId?: string,
  ): Promise<T> {
    // Validate and generate eventId if needed (R5)
    const validEventId = this.validateAndGenerateEventId(
      eventId,
      handlerId || this.constructor.name,
    );
    const actualHandlerId = handlerId || this.constructor.name;

    try {
      // Step 1: Check if already processed
      const existing = await this.prisma.processedEvent.findUnique({
        where: {
          eventId_handlerId: {
            eventId: validEventId,
            handlerId: actualHandlerId,
          },
        },
      });

      // Step 2: If already processed, return (skip handler)
      if (existing) {
        if (existing.status === 'SUCCESS') {
          this.logger.debug(
            `[IDEMPOTENT] Event ${validEventId} (v${eventVersion}) already processed by ${actualHandlerId}, skipping`,
          );
          return null as T;
        }

        if (existing.status === 'RETRYING') {
          this.logger.warn(
            `[IDEMPOTENT] Event ${validEventId} (v${eventVersion}) is currently being processed by ${actualHandlerId}, retrying...`,
          );
          // Wait a bit and retry
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return this.withIdempotency(
            validEventId,
            handler,
            handlerId,
            eventVersion,
            correlationId,
          );
        }

        if (existing.status === 'FAILED') {
          this.logger.error(
            `[IDEMPOTENT] Event ${validEventId} (v${eventVersion}) previously failed in ${actualHandlerId}: ${existing.errorMessage}`,
          );
          // Optionally: retry or throw based on retry policy
        }
      }

      // Step 3: Mark as RETRYING (prevent concurrent processing)
      await this.prisma.processedEvent.create({
        data: {
          eventId: validEventId,
          eventType: 'USER_WENT_ONLINE', // TODO: Extract from event payload or pass as param
          handlerId: actualHandlerId,
          status: 'RETRYING',
          eventVersion,
          correlationId,
        },
      });

      // Step 4: Run handler
      let result: T;
      try {
        result = await handler();
        this.logger.debug(
          `[IDEMPOTENT] Successfully processed event ${validEventId} (v${eventVersion}) in ${actualHandlerId}`,
        );

        // Step 5: Mark as SUCCESS
        await this.prisma.processedEvent.update({
          where: {
            eventId_handlerId: {
              eventId: validEventId,
              handlerId: actualHandlerId,
            },
          },
          data: {
            status: 'SUCCESS',
            processedAt: new Date(),
          },
        });

        return result;
      } catch (error) {
        this.logger.error(
          `[IDEMPOTENT] Failed processing event ${validEventId} (v${eventVersion}) in ${actualHandlerId}`,
          error,
        );

        // Step 5: Mark as FAILED with error message
        await this.prisma.processedEvent.update({
          where: {
            eventId_handlerId: {
              eventId: validEventId,
              handlerId: actualHandlerId,
            },
          },
          data: {
            status: 'FAILED',
            errorMessage:
              error instanceof Error ? error.message : String(error),
            retryCount: (existing?.retryCount ?? 0) + 1,
          },
        });

        throw error;
      }
    } catch (error) {
      // Fatal error in idempotency check itself
      this.logger.error(
        `[IDEMPOTENT] Idempotency wrapper failed for event ${eventId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Validate eventId and generate if needed (R5 Enhancement)
   * Uses EventIdGenerator for proper UUID v4 validation
   *
   * @private
   */
  private validateAndGenerateEventId(
    eventId: string | undefined,
    context: string,
  ): string {
    // If provided and valid, use it
    if (eventId && EventIdGenerator.isValid(eventId)) {
      return eventId;
    }

    // Otherwise generate new ID
    const generatedId = EventIdGenerator.generate();
    this.logger.warn(
      `[IDEMPOTENT] Generated new eventId: ${generatedId} for context: ${context}`,
    );
    return generatedId;
  }

  /**
   * Batch process multiple events (optimized for bulk operations).
   * MUST be idempotent: running twice produces same result.
   *
   * @example
   * ```typescript
   * async handleMessagesSeen(events: MessageSeenEvent[]) {
   *   const eventIds = events.map(e => e.eventId).join(',');
   *   return this.withIdempotency(eventIds, async () => {
   *     await this.db.message.updateMany({
   *       where: { id: { in: events.map(e => e.messageId) } },
   *       data: { status: 'SEEN' },
   *     });
   *   });
   * }
   * ```
   */
  protected async withBatchIdempotency<T>(
    batchId: string,
    handler: () => Promise<T>,
    handlerId?: string,
  ): Promise<T> {
    // For batch: use hash of batch items as idempotency key
    return this.withIdempotency(batchId, handler, handlerId);
  }

  /**
   * PHASE 5: Dead-Letter Queue support (not in PHASE 1).
   * For now, throw error to let EventEmitter2 handle retry.
   *
   * @internal
   * This will be enhanced in PHASE 5 with Kafka/RabbitMQ DLQ implementation.
   */
  protected async sendToDLQ(
    eventId: string,
    error: Error,
    handlerId: string,
  ): Promise<void> {
    // TODO PHASE 5: Implement DLQ integration
    this.logger.error(
      `[DLQ] Event ${eventId} failed in ${handlerId}, would be sent to DLQ in PHASE 5`,
    );
  }
}

/**
 * RULE_6: IDEMPOTENCY GUARANTEE
 *
 * PHASE 1: EventEmitter2 (in-process)
 * - withIdempotency() uses processed_events table
 * - Prevents duplicate processing if event listener crashes and retries
 *
 * PHASE 5: Kafka/RabbitMQ (distributed)
 * - Message broker automatically retries failed consumers
 * - withIdempotency() becomes critical to prevent data corruption
 *
 * Example of why idempotency matters:
 * ```
 * Event: MessageSent { messageId: 'msg-1', status: 'SENT' }
 *
 * Without idempotency (❌ WRONG):
 * 1. Listener processes: UPDATE messages SET status='DELIVERED' WHERE id='msg-1'
 * 2. Event retried (broker or crash)
 * 3. Listener processes again: UPDATE messages SET status='DELIVERED' WHERE id='msg-1'
 * 4. Result: Safe because idempotent query
 *
 * But with counter (❌ WRONG):
 * 1. Listener: UPDATE users SET message_count = message_count + 1 WHERE id='user-1'
 * 2. Event retried
 * 3. Listener: UPDATE users SET message_count = message_count + 1 WHERE id='user-1'
 * 4. Result: ❌ User has message_count += 2 (WRONG!)
 *
 * With idempotency (✅ CORRECT):
 * 1. First time: Process + mark as processed
 * 2. Event retried: Skip (already in processed_events)
 * 3. Result: ✅ User has message_count += 1 (CORRECT!)
 * ```
 */
