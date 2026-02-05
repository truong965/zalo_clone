import { v4 as uuidv4 } from 'uuid';
import { EventType } from '@prisma/client';

/**
 * PHASE 3.4: Event Versioning Framework
 *
 * Base class for all versioned domain events with full metadata support
 * Enables event schema evolution, replay, and audit trail
 *
 * Features:
 * - Event ID for idempotency & tracking
 * - Version for schema evolution
 * - Timestamp for ordering & auditing
 * - Source for traceability
 * - Aggregate ID for domain entity tracking
 * - Correlation ID for distributed tracing
 */
export abstract class VersionedDomainEvent {
  /**
   * Unique event identifier for idempotency
   * Used with handler ID to form unique constraint: (eventId, handlerId)
   */
  readonly eventId: string;

  /**
   * Event schema version for backward compatibility
   * Enables non-breaking event evolution
   * Example: V1 → V2 (new fields), V3 (removed fields)
   */
  readonly version: number;

  /**
   * Event creation timestamp (UTC)
   * Used for event ordering and audit trail
   */
  readonly timestamp: Date;

  /**
   * Source module that emitted this event
   * For traceability and debugging
   * Example: 'BlockModule', 'SocialModule', 'MessagingModule'
   */
  readonly source: string;

  /**
   * Aggregate ID: The primary entity that changed
   * Example: blockerId, conversationId, messageId
   * Used for event filtering and audit trails
   */
  readonly aggregateId: string;

  /**
   * Correlation ID for distributed tracing
   * Links related events across services/operations
   * Optional: Set by orchestrator for complex flows
   */
  readonly correlationId?: string;

  /**
   * Event schema name (matches EventType enum in Prisma)
   * Example: 'USER_BLOCKED', 'MESSAGE_SENT', 'CALL_INITIATED'
   */
  abstract readonly eventType: EventType;

  protected constructor(
    aggregateId: string,
    source: string,
    version: number = 1,
    correlationId?: string,
  ) {
    this.eventId = uuidv4();
    this.version = version;
    this.timestamp = new Date();
    this.source = source;
    this.aggregateId = aggregateId;
    this.correlationId = correlationId;
  }

  /**
   * Validate event data at runtime
   * Override in subclass for specific validation
   *
   * @returns true if valid, false otherwise
   */
  isValid(): boolean {
    return (
      !!this.eventId &&
      !!this.timestamp &&
      !!this.source &&
      !!this.aggregateId &&
      this.version > 0
    );
  }

  /**
   * Convert to plain object for serialization
   * Used when storing in database or sending via message bus
   */
  toJSON(): Record<string, any> {
    return {
      eventId: this.eventId,
      version: this.version,
      timestamp: this.timestamp,
      source: this.source,
      aggregateId: this.aggregateId,
      correlationId: this.correlationId,
      eventType: this.eventType,
    };
  }
}

/**
 * Event upgrade/downgrade strategy
 * Defines how to handle version mismatches between producer and consumer
 */
export interface EventVersionStrategy<T extends VersionedDomainEvent> {
  /**
   * Upgrade event from older version to current version
   * Called when handler expects newer version than event has
   *
   * @param oldEvent - Event with older version
   * @returns Upgraded event compatible with current handler
   */
  upgrade(oldEvent: any): T;

  /**
   * Downgrade event to older version
   * Called when consumer only understands older version
   *
   * @param newEvent - Event with newer version
   * @returns Downgraded event compatible with consumer
   */
  downgrade(newEvent: T): any;

  /**
   * Check if event is compatible with this strategy
   *
   * @param event - Event to check
   * @returns true if can handle event
   */
  isCompatible(event: any): boolean;
}

/**
 * Default implementation of event versioning
 * Supports linear versioning (V1 → V2 → V3...)
 */
export abstract class LinearVersionStrategy<
  T extends VersionedDomainEvent,
> implements EventVersionStrategy<T> {
  protected abstract readonly currentVersion: number;

  /**
   * Version upgrade handlers
   * Map from version N to handler that upgrades N→N+1
   */
  protected abstract readonly upgradeHandlers: Record<
    number,
    (event: any) => any
  >;

  /**
   * Version downgrade handlers
   * Map from version N to handler that downgrades N→N-1
   */
  protected abstract readonly downgradeHandlers: Record<
    number,
    (event: any) => any
  >;

  upgrade(oldEvent: any): T {
    let upgraded = oldEvent;
    const startVersion = oldEvent.version || 1;

    // Upgrade from startVersion to currentVersion
    for (let v = startVersion; v < this.currentVersion; v++) {
      const handler = this.upgradeHandlers[v];
      if (!handler) {
        throw new Error(
          `No upgrade handler for version ${v} → ${v + 1}. Event: ${oldEvent.eventType}`,
        );
      }
      upgraded = handler(upgraded);
    }

    return upgraded;
  }

  downgrade(newEvent: T): any {
    let downgraded = newEvent;

    // Downgrade from currentVersion to version 1 (can override)
    for (let v = this.currentVersion; v > 1; v--) {
      const handler = this.downgradeHandlers[v];
      if (!handler) {
        throw new Error(
          `No downgrade handler for version ${v} → ${v - 1}. Event: ${newEvent.eventType}`,
        );
      }
      downgraded = handler(downgraded);
    }

    return downgraded;
  }

  isCompatible(event: any): boolean {
    return (
      event &&
      typeof event.eventType === 'string' &&
      (event.version === undefined || event.version <= this.currentVersion)
    );
  }
}

/**
 * Event versioning registry
 * Centralized registry of all event versions and their upgrade paths
 */
export class EventVersioningRegistry {
  private strategies: Map<string, EventVersionStrategy<any>> = new Map();

  /**
   * Register event versioning strategy
   *
   * @param eventType - Event type name (e.g., 'USER_BLOCKED')
   * @param strategy - Version strategy for this event type
   */
  register(eventType: string, strategy: EventVersionStrategy<any>): void {
    this.strategies.set(eventType, strategy);
  }

  /**
   * Get strategy for event type
   *
   * @param eventType - Event type name
   * @returns Strategy or undefined if not found
   */
  getStrategy(eventType: string): EventVersionStrategy<any> | undefined {
    return this.strategies.get(eventType);
  }

  /**
   * Upgrade event to target version if strategy exists
   *
   * @param event - Event to upgrade
   * @param targetVersion - Target version (defaults to latest)
   * @returns Upgraded event or original if no strategy
   */
  upgradeEvent(event: any, targetVersion?: number): any {
    const strategy = this.getStrategy(event.eventType);
    if (!strategy) {
      return event;
    }

    return strategy.upgrade(event);
  }

  /**
   * Downgrade event if strategy exists
   *
   * @param event - Event to downgrade
   * @returns Downgraded event or original if no strategy
   */
  downgradeEvent(event: any): any {
    const strategy = this.getStrategy(event.eventType);
    if (!strategy) {
      return event;
    }

    return strategy.downgrade(event);
  }

  /**
   * Check compatibility with all registered strategies
   *
   * @param event - Event to check
   * @returns true if compatible with at least one strategy
   */
  isCompatible(event: any): boolean {
    const strategy = this.getStrategy(event.eventType);
    if (!strategy) {
      // No strategy registered - assume compatible
      return true;
    }

    return strategy.isCompatible(event);
  }
}

/**
 * Global event versioning registry instance
 * Can be injected or used as singleton
 */
export const globalEventRegistry = new EventVersioningRegistry();
