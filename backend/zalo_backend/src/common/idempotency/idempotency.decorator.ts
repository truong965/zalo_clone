import { Logger } from '@nestjs/common';
import { EventIdGenerator } from '../utils/event-id-generator';

/**
 * PHASE 3.3: @Idempotent() Decorator
 *
 * Automatically wraps event handler methods with idempotency checking
 * Prevents duplicate processing of the same event by the same handler
 *
 * Enhancement (R5 - Event Versioning Support):
 * - Validates eventId using EventIdGenerator.isValid() (UUID v4 validation)
 * - Tracks correlation IDs for multi-event chains
 * - Supports event versioning for schema evolution
 * - Generates proper eventIds if missing (not just Date.now())
 *
 * Usage:
 *   @OnEvent('user.blocked')
 *   @Idempotent({ maxRetries: 3, eventVersion: 1 })
 *   handleUserBlocked(payload: UserBlockedEvent): void { }
 *
 * Flow:
 *   1. Extract and validate eventId:
 *      - Check payload.eventId using EventIdGenerator.isValid()
 *      - Extract correlationId for event chain tracking
 *      - If eventId missing/invalid → Generate using EventIdGenerator
 *
 *   2. Before handler execution:
 *      - Check IdempotencyService.isProcessed(eventId, handlerId)
 *      - If already processed successfully → Skip execution (return)
 *      - If first time or failed → Continue to step 3
 *
 *   3. Execute handler with context (eventId, correlationId, version)
 *
 *   4. After successful execution:
 *      - Record in IdempotencyService.recordProcessed()
 *      - Update correlation chain
 *
 *   5. On error during execution:
 *      - Record in IdempotencyService.recordError()
 *      - Check if can retry
 *      - If yes → Re-throw (message broker retries)
 *      - If no → Log permanent failure
 */

interface IdempotentOptions {
  maxRetries?: number; // Default: 3
  includeInAudit?: boolean; // Default: true
  eventVersion?: number; // Default: 1 (for event versioning support)
}

export function Idempotent(options: IdempotentOptions = {}) {
  const { maxRetries = 3, eventVersion = 1 } = options;
  const logger = new Logger('Idempotent');

  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // Get IdempotencyService from this context
      // It's injected into the handler class
      const idempotencyService = this.idempotency;

      if (!idempotencyService) {
        logger.warn(
          `[DECORATOR] No IdempotencyService injected in ${target.constructor.name}. Executing without idempotency check.`,
        );
        return originalMethod.apply(this, args);
      }

      // Extract event payload (first argument)
      const eventPayload = args[0];

      if (!eventPayload || typeof eventPayload !== 'object') {
        logger.warn(
          `[DECORATOR] Cannot extract eventId from payload. Executing without idempotency.`,
        );
        return originalMethod.apply(this, args);
      }

      // Enhanced: Extract and validate event ID using EventIdGenerator
      const eventId = extractEventIdFromPayload(eventPayload, propertyKey);

      // If we can't get eventId, just execute without idempotency tracking
      if (!eventId) {
        logger.debug(
          `[DECORATOR] No eventId in payload for ${propertyKey}. Executing without tracking.`,
        );
        return originalMethod.apply(this, args);
      }

      // Extract correlation ID for event chain tracking
      const correlationId = EventIdGenerator.getCorrelationId(eventPayload);

      // Extract or use provided event version
      const payloadVersion = eventPayload?.eventVersion ?? eventVersion;

      const handlerId = `${target.constructor.name}.${propertyKey}`;

      try {
        // STEP 1: Check if already processed
        const alreadyProcessed = await idempotencyService.isProcessed(
          eventId,
          handlerId,
        );

        if (alreadyProcessed) {
          logger.debug(
            `[DECORATOR] Skipping duplicate: ${eventId} in ${handlerId}`,
          );
          // Return early without executing handler (idempotent)
          return;
        }

        // STEP 2: Execute handler
        logger.debug(
          `[DECORATOR] Executing: ${eventId} in ${handlerId} (version: ${payloadVersion}, correlation: ${correlationId})`,
        );
        const result = await originalMethod.apply(this, args);

        // STEP 3: Record successful processing
        await idempotencyService.recordProcessed(eventId, handlerId);

        // Update correlation chain if present
        if (correlationId) {
          await idempotencyService.updateCorrelationChain?.(
            eventId,
            correlationId,
            'success',
          );
        }

        logger.debug(`[DECORATOR] Completed: ${eventId} in ${handlerId}`);

        return result;
      } catch (error) {
        // STEP 4: Record failed processing
        logger.error(
          `[DECORATOR] Error in ${handlerId} processing ${eventId}`,
          error,
        );

        await idempotencyService.recordError(
          eventId,
          handlerId,
          error as Error,
        );

        // Update correlation chain with error
        if (correlationId) {
          await idempotencyService.updateCorrelationChain?.(
            eventId,
            correlationId,
            'error',
          );
        }

        // Check if can retry
        const canRetry = await idempotencyService.canRetry(
          eventId,
          handlerId,
          maxRetries,
        );

        if (canRetry) {
          logger.warn(
            `[DECORATOR] Can retry: ${eventId} in ${handlerId}. Re-throwing error.`,
          );
          // Re-throw so message broker can retry
          throw error;
        } else {
          logger.error(
            `[DECORATOR] Max retries exceeded: ${eventId} in ${handlerId}. Giving up.`,
          );
          // Don't re-throw - consider it permanent failure
          return;
        }
      }
    };

    return descriptor;
  };
}

/**
 * Helper function to extract eventId from payload with fallback generation
 * Uses EventIdGenerator for proper UUID v4 validation
 */
function extractEventIdFromPayload(eventPayload: any, context: string): string {
  const logger = new Logger('EventIdExtractor');

  // Try primary field: eventId with UUID v4 validation
  if (eventPayload?.eventId && EventIdGenerator.isValid(eventPayload.eventId)) {
    logger.debug(`[IDEMPOTENCY] Using valid eventId: ${eventPayload.eventId}`);
    return eventPayload.eventId;
  }

  // Try secondary field: id with validation
  if (eventPayload?.id && EventIdGenerator.isValid(eventPayload.id)) {
    logger.debug(`[IDEMPOTENCY] Using valid id: ${eventPayload.id}`);
    return eventPayload.id;
  }

  // Fallback: Generate new eventId
  const generatedId = EventIdGenerator.generate();
  logger.warn(
    `[IDEMPOTENCY] Generated new eventId: ${generatedId} for context: ${context}`,
  );
  return generatedId;
}

/**
 * Alternative: Manual decorator factory for more control
 *
 * Usage:
 *   @IdempotentFactory(() => idempotencyService, { maxRetries: 5 })
 */
export function IdempotentFactory(
  serviceFactory: () => any,
  options: IdempotentOptions = {},
) {
  const { maxRetries = 3, eventVersion = 1 } = options;
  const logger = new Logger('IdempotentFactory');

  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const idempotencyService = serviceFactory();

      if (!idempotencyService) {
        logger.warn('No IdempotencyService available');
        return originalMethod.apply(this, args);
      }

      // Extract payload and eventId
      const eventPayload = args[0];
      const eventId = extractEventIdFromPayload(eventPayload, propertyKey);

      if (!eventId) {
        return originalMethod.apply(this, args);
      }

      // Extract correlation ID
      const correlationId = EventIdGenerator.getCorrelationId(eventPayload);
      const payloadVersion = eventPayload?.eventVersion ?? eventVersion;

      const handlerId = target.constructor.name;

      try {
        const alreadyProcessed = await idempotencyService.isProcessed(
          eventId,
          handlerId,
        );

        if (alreadyProcessed) {
          logger.debug(`[FACTORY] Skipping duplicate: ${eventId}`);
          return;
        }

        logger.debug(
          `[FACTORY] Executing: ${eventId} (version: ${payloadVersion}, correlation: ${correlationId})`,
        );
        const result = await originalMethod.apply(this, args);
        await idempotencyService.recordProcessed(eventId, handlerId);

        // Update correlation chain if present
        if (correlationId) {
          await idempotencyService.updateCorrelationChain?.(
            eventId,
            correlationId,
            'success',
          );
        }

        return result;
      } catch (error) {
        await idempotencyService.recordError(
          eventId,
          handlerId,
          error as Error,
        );

        // Update correlation chain with error
        if (correlationId) {
          await idempotencyService.updateCorrelationChain?.(
            eventId,
            correlationId,
            'error',
          );
        }

        const canRetry = await idempotencyService.canRetry(
          eventId,
          handlerId,
          maxRetries,
        );

        if (canRetry) {
          logger.warn(`[FACTORY] Can retry: ${eventId}. Re-throwing.`);
          throw error;
        } else {
          logger.error(`[FACTORY] Max retries exceeded: ${eventId}`);
          return;
        }
      }
    };

    return descriptor;
  };
}
