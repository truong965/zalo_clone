/**
 * SHARED EVENTS MODULE
 *
 * Central exports for all event-driven infrastructure:
 * - Event contracts (type-safe payload interfaces)
 * - Base classes (DomainEvent, IdempotentListener)
 * - EventPublisher service
 * - Event types from all modules
 *
 *
 * @example
 * ```typescript
 * // Event contracts (no circular dependency)
 * import type { UserBlockedEventPayload } from '@shared/events/contracts';
 *
 * // In any service
 * import { EventPublisher, DomainEvent, IdempotentListener } from '@shared/events';
 * import { UserBlockedEvent } from '@modules/block/events';
 *
 * @Injectable()
 * export class BlockService {
 *   constructor(private readonly eventPublisher: EventPublisher) {}
 *
 *   async blockUser(blockerId, blockedId) {
 *     await this.eventPublisher.publish(
 *       new UserBlockedEvent(blockerId, blockedId)
 *     );
 *   }
 * }
 * ```
 */

// Event Contracts (Phase 1.1 - type-safe, no circular deps)
export * from './contracts';

// Base Classes
export { DomainEvent, IdempotentListener } from './base';

// Service
export { EventPublisher } from './event-publisher.service';

// Event Types (Imported from respective modules)
export type {
  UserBlockedEvent,
  UserUnblockedEvent,
} from '@modules/block/events';
export type {
  FriendRequestSentEvent,
  FriendshipAcceptedEvent,
  FriendRequestRejectedEvent,
  UnfriendedEvent,
} from '@modules/friendship/events/versioned-friendship-events';
export type {
  MessageSentEvent,
  ConversationCreatedEvent,
} from '@modules/messaging/events';
export type {
  CallInitiatedEvent,
  CallEndedEvent,
} from '@modules/call/events';
export type { UserRegisteredEvent } from '@modules/auth/events';
