/**
 * Privacy Domain Event Contracts
 *
 * Payload interfaces for privacy-related events.
 * Event classes in PrivacyModule should produce payloads matching these interfaces.
 *
 * @see docs/IMPLEMENTATION_PLAN_BLOCK_PRIVACY_FRIENDSHIP.md
 */

import type { BaseEvent } from './base-event.interface';

export interface PrivacySettingsUpdatedPayload extends BaseEvent {
  eventType: 'PRIVACY_SETTINGS_UPDATED';
  userId: string;
  settings: Record<string, unknown>;
}
