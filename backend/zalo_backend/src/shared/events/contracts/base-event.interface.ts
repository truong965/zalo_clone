/**
 * Base Event Interface
 *
 * All domain event payloads MUST extend this interface.
 * Used for type-safe event contracts across modules.
 *
 * Rules:
 * - Primitives only (string, number, Date, Record<string, unknown>)
 * - NO imports of Service, Entity, or module-specific classes
 * - Prevents circular dependency between modules
 *
 * @see docs/IMPLEMENTATION_PLAN_BLOCK_PRIVACY_FRIENDSHIP.md
 */

export interface BaseEvent {
  /** Unique identifier for idempotency & tracking */
  eventId: string;
  /** When the event occurred (UTC) */
  timestamp: Date;
  /** Event schema version for evolution */
  version: number;
  /** Module that emitted (e.g. 'BlockModule', 'FriendshipModule') */
  source: string;
  /** Primary entity ID that changed */
  aggregateId: string;
  /** Optional trace ID for distributed tracing */
  correlationId?: string;
}
