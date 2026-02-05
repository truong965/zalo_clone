/**
 * Block Domain Event Contracts
 *
 * Payload interfaces for block-related events.
 * Event classes in BlockModule should produce payloads matching these interfaces.
 *
 * @see docs/IMPLEMENTATION_PLAN_BLOCK_PRIVACY_FRIENDSHIP.md
 */

import type { BaseEvent } from './base-event.interface';

export interface UserBlockedEventPayload extends BaseEvent {
  eventType: 'USER_BLOCKED';
  blockerId: string;
  blockedId: string;
  blockId: string;
  reason?: string;
}

export interface UserUnblockedEventPayload extends BaseEvent {
  eventType: 'USER_UNBLOCKED';
  blockerId: string;
  blockedId: string;
  blockId: string;
}
