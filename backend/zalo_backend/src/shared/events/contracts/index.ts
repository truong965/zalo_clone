/**
 * Event Contracts - Central Exports
 *
 * Pure TypeScript interfaces for domain event payloads.
 * Use these for type-safe event publishing and listening across modules.
 *
 * Rules:
 * - Contracts contain only primitives and shared DTOs
 * - No Service or Entity imports
 * - Prevents circular dependency
 */

export type { BaseEvent } from './base-event.interface';

export type {
  UserBlockedEventPayload,
  UserUnblockedEventPayload,
} from './block-events.contract';

export type {
  FriendshipRequestSentPayload,
  FriendshipAcceptedPayload,
  FriendshipRejectedPayload,
  FriendshipCancelledPayload,
  UnfriendedPayload,
} from './friendship-events.contract';

export type { PrivacySettingsUpdatedPayload } from './privacy-events.contract';
