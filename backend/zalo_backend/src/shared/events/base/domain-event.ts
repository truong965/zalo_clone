/**
 * DomainEvent Base Class
 *
 * All domain events MUST extend this class to ensure:
 * ✅ Event identity (eventId for idempotency)
 * ✅ Event versioning (version for evolution)
 * ✅ Traceability (correlationId, causationId)
 * ✅ Audit trail (timestamp, source)
 *
 * @example
 * ```typescript
 * export class UserBlockedEvent extends DomainEvent {
 *   constructor(
 *     readonly blockerId: string,
 *     readonly blockedId: string,
 *     readonly reason?: string,
 *   ) {
 *     super('BlockModule', 'USER_BLOCKED', blockerId);
 *   }
 * }
 * ```
 *
 * @rule EVENT_DRIVEN_RULES.RULE_1: Strict Event Contracts
 * Every event MUST be a concrete class extending DomainEvent, NOT an interface.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Base class for all domain events in the system.
 * Provides standard metadata required for event-driven architecture.
 *
 * Fields:
 * - eventId: Unique identifier for idempotency (prevents duplicate processing)
 * - version: Event contract version for evolution
 * - timestamp: When event occurred (for ordering)
 * - source: Which module emitted (for ownership tracking)
 * - correlationId: Trace ID across multiple events (for debugging)
 * - causationId: What event caused this (for causality)
 */
export abstract class DomainEvent {
  /**
   * Unique event ID for idempotency.
   * Use as idempotency key: if same eventId arrives twice, process only once.
   */
  readonly eventId: string;

  /**
   * Event contract version for backward compatibility.
   * When you add a new field to an event:
   *
   * ✅ CORRECT:
   * Version 1: { blockerId, blockedId }
   * Version 2: { blockerId, blockedId, reason?: string }
   * version: 2  // increment version
   *
   * Listeners check: if (event.version < 2) { ... old logic }
   *
   * ❌ WRONG: Don't create UserBlockedEventV2 class, store version IN the event
   */
  readonly version: number;

  /**
   * When the event occurred (not when it was published to queue).
   * Use for event ordering in distributed systems.
   */
  readonly timestamp: Date;

  /**
   * Which module emitted this event.
   * MUST match event ownership (BlockModule owns UserBlockedEvent, etc.)
   *
   * @example 'BlockModule', 'SocialModule', 'MessagingModule'
   */
  readonly source: string;

  /**
   * Aggregate ID that changed (e.g., userId, conversationId, callId).
   * Use to replay all events for a specific aggregate.
   *
   * @example '550e8400-e29b-41d4-a716-446655440000'
   */
  readonly aggregateId: string;

  /**
   * Type of aggregate (User, Conversation, Call).
   * Use to categorize events by domain entity.
   */
  readonly aggregateType: string;

  /**
   * Trace ID for request/response tracing across services.
   * Optional - set if this event was triggered by HTTP request.
   * Use to debug: "What HTTP request caused this event chain?"
   */
  readonly correlationId?: string;

  /**
   * Event ID that caused this event (causality).
   * Optional - for complex event chains.
   * Example: FriendshipAccepted (causation) → NotificationSent (new event)
   */
  readonly causationId?: string;

  /**
   * Additional metadata not part of event schema.
   * Use for runtime context (userId, ipAddress, etc.)
   * MUST NOT be used for business logic.
   */
  readonly metadata?: Record<string, unknown>;

  /**
   * Initialize domain event with required metadata.
   *
   * @param source - Module that emitted (e.g., 'BlockModule')
   * @param aggregateType - Type of changed entity (e.g., 'User', 'Conversation')
   * @param aggregateId - ID of changed entity
   * @param version - Event contract version (default: 1)
   */
  constructor(
    source: string,
    aggregateType: string,
    aggregateId: string,
    version: number = 1,
  ) {
    this.eventId = uuidv4();
    this.source = source;
    this.aggregateType = aggregateType;
    this.aggregateId = aggregateId;
    this.version = version;
    this.timestamp = new Date();
  }

  /**
   * Attach correlation ID for tracing.
   * @returns self for method chaining
   */
  withCorrelationId(correlationId: string): this {
    (this as any).correlationId = correlationId;
    return this;
  }

  /**
   * Attach causation ID (what event caused this).
   * @returns self for method chaining
   */
  withCausationId(causationId: string): this {
    (this as any).causationId = causationId;
    return this;
  }

  /**
   * Attach metadata for runtime context.
   * @returns self for method chaining
   */
  withMetadata(metadata: Record<string, unknown>): this {
    (this as any).metadata = metadata;
    return this;
  }

  /**
   * Serialize event for storage/transmission.
   * Used by EventPublisher to persist to database.
   */
  toJSON() {
    return {
      eventId: this.eventId,
      version: this.version,
      timestamp: this.timestamp.toISOString(),
      source: this.source,
      aggregateType: this.aggregateType,
      aggregateId: this.aggregateId,
      correlationId: this.correlationId,
      causationId: this.causationId,
      metadata: this.metadata,
      // Event-specific fields will be added by subclass toJSON()
    };
  }
}

/**
 * RULE_1: STRICT EVENT CONTRACTS
 * ❌ FORBIDDEN: Using interfaces for events
 * ✅ REQUIRED: Every event extends DomainEvent class
 *
 * @example ❌ WRONG
 * export interface UserBlockedEvent {
 *   blockerId: string;
 *   blockedId: string;
 * }
 *
 * @example ✅ CORRECT
 * export class UserBlockedEvent extends DomainEvent {
 *   constructor(
 *     readonly blockerId: string,
 *     readonly blockedId: string,
 *   ) {
 *     super('BlockModule', 'User', blockerId);
 *   }
 * }
 */
