import { DomainEvent } from '@shared/events';

export class PrivacySettingsUpdatedEvent extends DomainEvent {
  readonly eventType = 'PRIVACY_SETTINGS_UPDATED';
  readonly version = 1;

  constructor(
    readonly userId: string,
    readonly settings: Record<string, unknown>,
  ) {
    super('PrivacyModule', 'PrivacySettings', userId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      userId: this.userId,
      settings: this.settings,
      eventType: this.eventType,
    };
  }
}
