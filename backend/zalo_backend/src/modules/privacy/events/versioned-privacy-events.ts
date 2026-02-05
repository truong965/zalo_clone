import { EventType } from '@prisma/client';
import {
  VersionedDomainEvent,
  LinearVersionStrategy,
} from '@common/events/versioned-event';

/**
 * PHASE 1: Versioned Privacy Domain Events
 *
 * Privacy settings events with full versioning support
 * Version history:
 * - V1: userId, privacySetting, oldValue, newValue, changedAt
 * - V2 (future): Add compliance metadata, audit trail enrichment
 */

// ============================================================================
// PRIVACY_SETTINGS_UPDATED EVENT
// ============================================================================

/**
 * V1 (Current): PrivacySettingsUpdatedEvent
 * Emitted when user privacy settings are changed
 */
export class PrivacySettingsUpdatedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.PRIVACY_SETTINGS_UPDATED;

  constructor(
    readonly userId: string,
    readonly settingName: string,
    readonly oldValue: boolean | string,
    readonly newValue: boolean | string,
    readonly settingCategory:
      | 'VISIBILITY'
      | 'MESSAGING'
      | 'CALLS'
      | 'NOTIFICATIONS'
      | 'DATA_SHARING',
    correlationId?: string,
  ) {
    super(userId, 'PrivacyModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.userId &&
      !!this.settingName &&
      this.oldValue !== undefined &&
      this.newValue !== undefined &&
      !!this.settingCategory
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      userId: this.userId,
      settingName: this.settingName,
      oldValue: this.oldValue,
      newValue: this.newValue,
      settingCategory: this.settingCategory,
    };
  }
}

export class PrivacySettingsUpdatedEventStrategy extends LinearVersionStrategy<PrivacySettingsUpdatedEvent> {
  protected currentVersion = 1;

  protected upgradeHandlers: Record<number, (event: any) => any> = {
    // V1 → V2: Add compliance tracking (future)
    // 1: (event) => ({
    //   ...event,
    //   version: 2,
    //   complianceRequired: false,
    //   auditId: null,
    // }),
  };

  protected downgradeHandlers: Record<number, (event: any) => any> = {
    // V2 → V1: Remove compliance tracking (future)
    // 2: (event) => {
    //   const { complianceRequired, auditId, ...rest } = event;
    //   return { ...rest, version: 1 };
    // },
  };
}

// ============================================================================
// USER_VISIBILITY_CHANGED EVENT
// ============================================================================

export class UserVisibilityChangedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.PRIVACY_SETTINGS_UPDATED;

  constructor(
    readonly userId: string,
    readonly visibilityLevel: 'PUBLIC' | 'FRIENDS_ONLY' | 'PRIVATE',
    readonly appliedAt: Date,
    readonly affectedSections?: string[],
    correlationId?: string,
  ) {
    super(userId, 'PrivacyModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.userId &&
      !!this.visibilityLevel &&
      this.appliedAt instanceof Date
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      userId: this.userId,
      visibilityLevel: this.visibilityLevel,
      appliedAt: this.appliedAt,
      affectedSections: this.affectedSections,
    };
  }
}

export class UserVisibilityChangedEventStrategy extends LinearVersionStrategy<UserVisibilityChangedEvent> {
  protected currentVersion = 1;
  protected upgradeHandlers: Record<number, (event: any) => any> = {};
  protected downgradeHandlers: Record<number, (event: any) => any> = {};
}
