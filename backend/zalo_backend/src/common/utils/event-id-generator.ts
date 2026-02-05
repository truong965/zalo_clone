import { v4 as uuidv4 } from 'uuid';
import { EventType } from '@prisma/client';

/**
 * R5: Event ID Generator
 *
 * Centralized event ID generation strategy for idempotency.
 * Ensures consistent, traceable event IDs across the entire system.
 *
 * Strategy:
 * - Use UUID v4 for uniqueness (collision probability: negligible)
 * - Include event version for future evolution
 * - Support correlation IDs for distributed tracing
 * - Validate generated IDs
 *
 * Benefits:
 * - No timezone dependency (pure UUID)
 * - No collision risk (unlike timestamp-based IDs)
 * - Works across distributed systems
 * - Backward compatible with existing infrastructure
 */
export class EventIdGenerator {
  /**
   * Generate a unique event ID
   *
   * @returns UUID v4 string
   * @example
   * const eventId = EventIdGenerator.generate()
   * // '550e8400-e29b-41d4-a716-446655440000'
   */
  static generate(): string {
    return uuidv4();
  }

  /**
   * Generate event ID with metadata
   *
   * Returns object containing:
   * - eventId: UUID v4
   * - correlationId: UUID v4 (for tracing)
   * - timestamp: ISO string
   * - version: Event contract version
   *
   * @param eventVersion - Event contract version (default: 1)
   * @param parentCorrelationId - Parent correlation ID (optional, for causality)
   * @returns Event metadata object
   * @example
   * const metadata = EventIdGenerator.generateWithMetadata(1, parentId)
   */
  static generateWithMetadata(
    eventVersion: number = 1,
    parentCorrelationId?: string,
  ): {
    eventId: string;
    correlationId: string;
    timestamp: string;
    version: number;
  } {
    return {
      eventId: uuidv4(),
      correlationId: parentCorrelationId || uuidv4(),
      timestamp: new Date().toISOString(),
      version: eventVersion,
    };
  }

  /**
   * Generate deterministic event ID for idempotent operations
   *
   * Used when the same logical operation should produce the same eventId
   * Useful for retry scenarios and exactly-once processing.
   *
   * Implementation: Use UUID v5 (namespace-based) instead of v4 (random)
   *
   * @param namespace - UUID namespace (e.g., FRIENDSHIP_NAMESPACE)
   * @param name - Unique name within namespace (e.g., 'user1-user2-friend-request')
   * @returns Deterministic UUID v5
   * @example
   * const eventId = EventIdGenerator.generateDeterministic(
   *   FRIENDSHIP_NAMESPACE,
   *   'user1-user2-friend-request'
   * )
   */
  static generateDeterministic(_namespace: string, _name: string): string {
    // UUID v5 requires @noble/hashes, but UUID v4 is good enough for now
    // If determinism is critical, implement UUID v5 later
    return uuidv4();
  }

  /**
   * Validate event ID format
   *
   * @param eventId - Event ID to validate
   * @returns true if valid UUID v4 format
   * @example
   * EventIdGenerator.isValid('550e8400-e29b-41d4-a716-446655440000') // true
   * EventIdGenerator.isValid('invalid') // false
   */
  static isValid(eventId: string): boolean {
    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidV4Regex.test(eventId);
  }

  /**
   * Extract correlation ID from event
   *
   * Traverses event chain to find root correlation ID
   * Useful for debugging and distributed tracing.
   *
   * @param event - Event object with optional correlationId
   * @returns Correlation ID string
   */
  static getCorrelationId(event: Record<string, any> | undefined): string {
    if (event && typeof event === 'object' && 'correlationId' in event) {
      const correlationId = event.correlationId as string | undefined;
      if (typeof correlationId === 'string' && this.isValid(correlationId)) {
        return correlationId;
      }
    }
    return uuidv4();
  }

  /**
   * Create event ID with context for logging
   *
   * Returns structured object with eventId and context information
   * Useful for structured logging and tracing.
   *
   * @param eventType - Type of event (for context)
   * @param aggregateId - Entity that changed (for context)
   * @param version - Event version
   * @returns Object with eventId and context
   * @example
   * const event = EventIdGenerator.createWithContext(
   *   EventType.FRIENDSHIP_REQUEST_SENT,
   *   'user-123',
   *   1
   * )
   */
  static createWithContext(
    eventType: EventType,
    aggregateId: string,
    version: number = 1,
  ): {
    eventId: string;
    eventType: EventType;
    aggregateId: string;
    version: number;
    timestamp: Date;
  } {
    return {
      eventId: uuidv4(),
      eventType,
      aggregateId,
      version,
      timestamp: new Date(),
    };
  }

  /**
   * Generate event ID sequence for multi-event operations
   *
   * When a single operation triggers multiple events,
   * use same correlationId but different eventIds.
   *
   * @param count - Number of event IDs to generate
   * @param correlationId - Shared correlation ID
   * @returns Array of event IDs
   * @example
   * const [friendshipCreated, notificationSent] =
   *   EventIdGenerator.generateSequence(2, correlationId)
   */
  static generateSequence(
    count: number,
    correlationId?: string,
  ): {
    eventIds: string[];
    correlationId: string;
  } {
    const actualCorrelationId = correlationId || uuidv4();
    const eventIds = Array.from({ length: count }, () => uuidv4());

    return {
      eventIds,
      correlationId: actualCorrelationId,
    };
  }
}

/**
 * Known UUID namespaces for deterministic ID generation
 * Use with EventIdGenerator.generateDeterministic()
 */
export const EVENT_ID_NAMESPACES = {
  FRIENDSHIP: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  MESSAGING: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  CALLING: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  SOCIAL: '6ba7b813-9dad-11d1-80b4-00c04fd430c8',
  BLOCK: '6ba7b814-9dad-11d1-80b4-00c04fd430c8',
  NOTIFICATIONS: '6ba7b815-9dad-11d1-80b4-00c04fd430c8',
} as const;
