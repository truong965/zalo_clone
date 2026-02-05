/**
 * EventPublisher Service
 *
 * Central hub for emitting domain events with:
 * ✅ Automatic persistence for critical events
 * ✅ EventEmitter2 integration (for in-process listeners)
 * ✅ Event validation
 * ✅ Correlation ID tracking
 *
 * PHASE 5: Extended with Kafka/RabbitMQ support
 *
 * @example
 * ```typescript
 * // In BlockService
 * constructor(private readonly eventPublisher: EventPublisher) {}
 *
 * async blockUser(blockerId: string, blockedId: string) {
 *   // Business logic...
 *
 *   // Emit event (auto-persisted if critical)
 *   await this.eventPublisher.publish(
 *     new UserBlockedEvent(blockerId, blockedId),
 *     { correlationId: request.id }
 *   );
 * }
 * ```
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { EventType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { DomainEvent } from '../events/base';

type DomainEventWithType = DomainEvent & { eventType: EventType };

function hasEventType(event: DomainEvent): event is DomainEventWithType {
  return (
    'eventType' in event &&
    typeof (event as Record<string, unknown>).eventType === 'string'
  );
}

function getEventType(event: DomainEvent): EventType {
  if (!hasEventType(event)) {
    throw new Error(`Invalid event: missing eventType`);
  }
  return event.eventType;
}

type DomainEventDbClient =
  | Pick<PrismaService, 'domainEvent'>
  | Prisma.TransactionClient;

/**
 * Set of event types that should be persisted for audit trail.
 * Only critical business events are stored (PHASE 1).
 *
 * PHASE 5: Will be replaced by event sourcing strategy.
 */
const CRITICAL_EVENTS = new Set([
  'USER_BLOCKED',
  'USER_UNBLOCKED',
  'FRIEND_REQUEST_ACCEPTED',
  'MESSAGE_SENT',
  'CONVERSATION_CREATED',
  'CONVERSATION_MEMBER_ADDED',
  'CONVERSATION_MEMBER_LEFT',
  'CONVERSATION_MEMBER_PROMOTED',
  'CONVERSATION_MEMBER_DEMOTED',
  'CALL_INITIATED',
  'CALL_ENDED',
  'USER_REGISTERED',
]);

/**
 * Options for publishing events.
 */
interface PublishOptions {
  /**
   * Correlation ID for distributed tracing.
   * Links this event to HTTP request or parent event.
   *
   * @example 'req-550e8400-e29b-41d4-a716-446655440000'
   */
  correlationId?: string;

  /**
   * Causation ID: what event caused this one.
   * For complex event chains: EventA → EventB → EventC
   *
   * @example 'evt-660e8400-e29b-41d4-a716-446655440111'
   */
  causationId?: string;

  /**
   * Additional metadata for context.
   * Will be stored with event for debugging.
   *
   * @example { userId: '...', ipAddress: '...' }
   */
  metadata?: Record<string, unknown>;

  /**
   * Skip persistence even if event is in CRITICAL_EVENTS.
   * Useful for testing or non-persistent events.
   *
   * @default false
   */
  skipPersistence?: boolean;

  /**
   * Publish async without waiting for listeners.
   * Faster but doesn't guarantee listener execution.
   *
   * @default false (wait for all listeners)
   */
  fireAndForget?: boolean;

  /**
   * If true, publishing will fail when any listener throws.
   * Intended for critical request paths that require listener success.
   *
   * Effective only when fireAndForget is false.
   *
   * @default false
   */
  throwOnListenerError?: boolean;
}

/**
 * Service for publishing domain events.
 *
 * Responsibilities:
 * 1. Validate event structure
 * 2. Persist critical events to database
 * 3. Emit to EventEmitter2 (in-process listeners)
 * 4. Track correlation & causation IDs
 * 5. (PHASE 5) Publish to message broker
 */
@Injectable()
export class EventPublisher {
  private readonly logger = new Logger(EventPublisher.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Publish a domain event.
   *
   * Flow:
   * 1. Validate event (must extend DomainEvent)
   * 2. Attach correlation/causation IDs
   * 3. Persist if critical event
   * 4. Emit via EventEmitter2 (notify listeners)
   * 5. (PHASE 5) Publish to Kafka/RabbitMQ
   *
   * @param event - Domain event to publish
   * @param options - Publishing options (correlation, causation, metadata)
   * @returns Event ID for tracking
   *
   * @throws Error if event validation fails
   *
   * @example
   * ```typescript
   * const event = new UserBlockedEvent(blockerId, blockedId);
   * const eventId = await eventPublisher.publish(event, {
   *   correlationId: 'req-12345',
   *   metadata: { source: 'API', userId: requesterId }
   * });
   * ```
   */
  async publish(event: DomainEvent, options?: PublishOptions): Promise<string> {
    // Step 1: Validate event structure
    this.validateEvent(event);

    // Step 2: Attach correlation/causation IDs
    if (options?.correlationId) {
      event.withCorrelationId(options.correlationId);
    }
    if (options?.causationId) {
      event.withCausationId(options.causationId);
    }
    if (options?.metadata) {
      event.withMetadata(options.metadata);
    }

    // Step 3: Persist if critical event
    if (!options?.skipPersistence) {
      await this.persistIfCritical(event);
    }

    // Step 4: Emit via EventEmitter2
    await this.emitEvent(
      event,
      options?.fireAndForget ?? false,
      options?.throwOnListenerError ?? false,
    );

    this.logger.debug(
      `Event published: ${getEventType(event)} (${event.eventId})`,
    );

    return event.eventId;
  }

  /**
   * Publish multiple events atomically.
   * All events persist in same transaction (if needed).
   *
   * Useful for complex operations that emit multiple events:
   * - BlockUser: emit UserBlocked + InvalidateCache
   * - AcceptFriendship: emit Accepted + CreateConversation + NotifyUser
   *
   * @param events - Array of events to publish
   * @param options - Publishing options (shared by all events)
   * @returns Array of event IDs
   *
   * @example
   * ```typescript
   * const eventIds = await eventPublisher.publishBatch([
   *   new UserBlockedEvent(...),
   *   new BlockCacheInvalidatedEvent(...),
   * ], { correlationId: 'req-123' });
   * ```
   */
  async publishBatch(
    events: DomainEvent[],
    options?: PublishOptions,
  ): Promise<string[]> {
    const eventIds: string[] = [];

    // Validate all events first
    for (const event of events) {
      this.validateEvent(event);
    }

    // Persist all critical events in single transaction
    const criticalEvents = events.filter(
      (e) => !options?.skipPersistence && CRITICAL_EVENTS.has(getEventType(e)),
    );

    if (criticalEvents.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const event of criticalEvents) {
          await this.persistEventToDb(event, tx);
        }
      });
    }

    // Emit each event
    for (const event of events) {
      if (options?.correlationId) {
        event.withCorrelationId(options.correlationId);
      }
      if (options?.causationId) {
        event.withCausationId(options.causationId);
      }
      if (options?.metadata) {
        event.withMetadata(options.metadata);
      }

      await this.emitEvent(
        event,
        options?.fireAndForget ?? false,
        options?.throwOnListenerError ?? false,
      );
      eventIds.push(event.eventId);
    }

    this.logger.debug(`Batch published: ${events.length} events`);
    return eventIds;
  }

  /**
   * Private: Validate event structure.
   *
   * Checks:
   * - Event extends DomainEvent
   * - Has required fields (eventId, version, timestamp, source)
   * - Payload is serializable to JSON
   */
  private validateEvent(event: DomainEvent): void {
    if (!event || typeof event !== 'object') {
      throw new Error(`Invalid event: must be an object`);
    }

    if (!event.eventId) {
      throw new Error(`Invalid event: missing eventId`);
    }

    if (event.version === undefined || event.version === null) {
      throw new Error(`Invalid event: missing version`);
    }

    if (!event.timestamp) {
      throw new Error(`Invalid event: missing timestamp`);
    }

    if (!event.source) {
      throw new Error(`Invalid event: missing source (which module emitted)`);
    }

    // Verify event is serializable
    try {
      JSON.stringify(event.toJSON());
    } catch (error) {
      throw new Error(`Invalid event: not JSON serializable - ${error}`);
    }
  }

  /**
   * Private: Persist event if it's in CRITICAL_EVENTS set.
   * Uses database transaction for consistency.
   */
  private async persistIfCritical(event: DomainEvent): Promise<void> {
    const eventType = getEventType(event);

    if (!CRITICAL_EVENTS.has(eventType)) {
      this.logger.debug(
        `Event ${eventType} is non-critical, skipping persistence`,
      );
      return;
    }

    try {
      await this.persistEventToDb(event, this.prisma);
      this.logger.debug(`Event ${eventType} persisted to database`);
    } catch (error) {
      this.logger.error(`Failed to persist event ${eventType}:`, error);
      // PHASE 5: Send to DLQ instead of throwing
      throw error;
    }
  }

  /**
   * Private: Persist event to database using provided client/transaction.
   */
  private async persistEventToDb(
    event: DomainEvent,
    prismaClient: DomainEventDbClient,
  ): Promise<void> {
    const payload = event.toJSON();

    await prismaClient.domainEvent.create({
      data: {
        eventId: event.eventId,
        eventType: getEventType(event),
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        version: event.version,
        source: event.source,
        correlationId: event.correlationId,
        causationId: event.causationId,
        payload: payload as unknown as Prisma.InputJsonValue,
        metadata: event.metadata as unknown as Prisma.InputJsonValue,
        occurredAt: event.timestamp,
      },
    });
  }

  /**
   * Private: Emit event via EventEmitter2 to notify listeners.
   *
   * Event name format: lowercase with dots (e.g., 'user.blocked')
   * Delimiter allows wildcard listeners (e.g., 'user.*')
   */
  private async emitEvent(
    event: DomainEvent,
    fireAndForget: boolean,
    throwOnListenerError: boolean,
  ): Promise<void> {
    const eventType = getEventType(event);
    const eventNames = this.eventTypeToEventNames(eventType);

    if (fireAndForget) {
      // Don't wait for listeners (faster but less safe)
      for (const eventName of eventNames) {
        this.eventEmitter.emit(eventName, event);
      }
      this.logger.debug(
        `Event emitted (fire-and-forget): ${eventNames.join(', ')}`,
      );
      return;
    } else {
      // Wait for all listeners to complete
      try {
        await Promise.all(
          eventNames.map((eventName) =>
            this.eventEmitter.emitAsync(eventName, event),
          ),
        );
      } catch (error) {
        this.logger.error(
          `Event listener failed for ${eventNames.join(', ')}:`,
          error,
        );
        if (throwOnListenerError) {
          throw error;
        }
      }
    }
  }

  /**
   * Convert event type to event name for EventEmitter2.
   *
   * USER_BLOCKED → 'user.blocked'
   * MESSAGE_SENT → 'message.sent'
   *
   * This allows:
   * - Specific listeners: @OnEvent('user.blocked')
   * - Wildcard listeners: @OnEvent('user.*')
   * - All: @OnEvent('*')
   */
  private eventTypeToEventNames(eventType: string): string[] {
    const primaryMap: Record<string, string> = {
      FRIEND_REQUEST_SENT: 'friendship.request.sent',
      FRIEND_REQUEST_ACCEPTED: 'friendship.accepted',
      FRIEND_REQUEST_REJECTED: 'friendship.request.declined',
      FRIEND_REQUEST_CANCELLED: 'friendship.request.cancelled',
      UNFRIENDED: 'friendship.unfriended',
      PRIVACY_SETTINGS_UPDATED: 'privacy.updated',
    };

    const legacyAliases: Record<string, string[]> = {
      FRIEND_REQUEST_SENT: ['friend_request.sent'],
      FRIEND_REQUEST_ACCEPTED: ['friend_request.accepted'],
      FRIEND_REQUEST_REJECTED: ['friend_request.rejected'],
      FRIEND_REQUEST_CANCELLED: ['friend_request.cancelled'],
      UNFRIENDED: ['unfriended'],
    };

    const primary =
      primaryMap[eventType] ?? eventType.toLowerCase().split('_').join('.');

    return [primary, ...(legacyAliases[eventType] ?? [])];
  }

  /**
   * PHASE 5: Will add method to query event store.
   *
   * @example
   * ```typescript
   * // Get all events for a user
   * const events = await eventPublisher.getEventStream(
   *   aggregateId: 'user-123',
   *   aggregateType: 'User'
   * );
   * ```
   */
}

/**
 * EVENT_DRIVEN_RULES.RULE_9: No Cross-Module Calls
 *
 * WRONG: Modules calling each other's services directly
 * ```typescript
 * @Injectable()
 * export class MessagingService {
 *   constructor(
 *     private readonly socialService: SocialService,  // ❌ WRONG
 *   ) {}
 *
 *   async sendMessage() {
 *     const canMessage = await this.socialService.checkPermission(...);  // ❌ Direct call
 *   }
 * }
 * ```
 *
 * CORRECT: Emit events, let other modules listen
 * ```typescript
 * @Injectable()
 * export class MessagingService {
 *   constructor(
 *     private readonly eventPublisher: EventPublisher,  // ✅ CORRECT
 *   ) {}
 *
 *   async sendMessage() {
 *     // Emit message sent, let SocketModule broadcast it
 *     await this.eventPublisher.publish(
 *       new MessageSentEvent(...),
 *       { correlationId: request.id }
 *     );
 *   }
 * }
 *
 * // In SocketModule
 * @Injectable()
 * export class MessageBroadcaster extends IdempotentListener {
 *   @OnEvent('message.sent')
 *   async handle(event: MessageSentEvent) {
 *     // React to event (emit socket message)
 *     this.socketGateway.emitToUsers(event.conversationId, event);
 *   }
 * }
 * ```
 */
