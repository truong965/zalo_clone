import { EventType } from '@prisma/client';
import {
  VersionedDomainEvent,
  LinearVersionStrategy,
} from '@common/events/versioned-event';

/**
 * PHASE 3.4: Versioned Auth & Security Domain Events
 *
 * Authentication and security events with full versioning support
 * Version history:
 * - V1: userId, action, deviceId, ipAddress, timestamp
 * - V2 (future): Add geolocation, risk scoring, compliance metadata
 */

// ============================================================================
// AUTH_REVOKED EVENT
// ============================================================================

/**
 * V1 (Current): AuthRevokedEvent
 * Emitted when user authentication is revoked (logout or device removal)
 */
export class AuthRevokedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.USER_REGISTERED;

  constructor(
    readonly userId: string,
    readonly revokedBy: 'USER' | 'ADMIN' | 'SYSTEM' = 'USER',
    readonly deviceId?: string,
    readonly reason?: string,
    correlationId?: string,
  ) {
    super(userId, 'AuthModule', 1, correlationId);
  }

  isValid(): boolean {
    return super.isValid() && !!this.userId && !!this.revokedBy;
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      userId: this.userId,
      revokedBy: this.revokedBy,
      deviceId: this.deviceId,
      reason: this.reason,
    };
  }
}

export class AuthRevokedEventStrategy extends LinearVersionStrategy<AuthRevokedEvent> {
  protected currentVersion = 1;

  protected upgradeHandlers: Record<number, (event: any) => any> = {
    // V1 → V2: Add security metadata
    // 1: (event) => ({
    //   ...event,
    //   version: 2,
    //   riskScore: 0,
    //   geolocation: null,
    // }),
  };

  protected downgradeHandlers: Record<number, (event: any) => any> = {
    // V2 → V1: Remove security metadata
    // 2: (event) => {
    //   const { riskScore, geolocation, ...rest } = event;
    //   return { ...rest, version: 1 };
    // },
  };
}

// ============================================================================
// DEVICE_REGISTERED EVENT
// ============================================================================

export class DeviceRegisteredEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.USER_REGISTERED;

  constructor(
    readonly userId: string,
    readonly deviceId: string,
    readonly deviceName: string,
    readonly deviceType: 'MOBILE' | 'WEB' | 'DESKTOP',
    readonly tokenHash: string,
    correlationId?: string,
  ) {
    super(userId, 'AuthModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.userId &&
      !!this.deviceId &&
      !!this.deviceName &&
      !!this.deviceType &&
      !!this.tokenHash
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      userId: this.userId,
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      deviceType: this.deviceType,
      tokenHash: this.tokenHash,
    };
  }
}

export class DeviceRegisteredEventStrategy extends LinearVersionStrategy<DeviceRegisteredEvent> {
  protected currentVersion = 1;
  protected upgradeHandlers: Record<number, (event: any) => any> = {};
  protected downgradeHandlers: Record<number, (event: any) => any> = {};
}

// ============================================================================
// DEVICE_REMOVED EVENT
// ============================================================================

export class DeviceRemovedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.USER_REGISTERED;

  constructor(
    readonly userId: string,
    readonly deviceId: string,
    readonly removedBy: 'USER' | 'ADMIN' | 'SYSTEM',
    readonly reason?: string,
    correlationId?: string,
  ) {
    super(userId, 'AuthModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() && !!this.userId && !!this.deviceId && !!this.removedBy
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      userId: this.userId,
      deviceId: this.deviceId,
      removedBy: this.removedBy,
      reason: this.reason,
    };
  }
}

export class DeviceRemovedEventStrategy extends LinearVersionStrategy<DeviceRemovedEvent> {
  protected currentVersion = 1;
  protected upgradeHandlers: Record<number, (event: any) => any> = {};
  protected downgradeHandlers: Record<number, (event: any) => any> = {};
}

// ============================================================================
// LOGIN_ATTEMPT EVENT
// ============================================================================

export class LoginAttemptEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.USER_REGISTERED;

  constructor(
    readonly userId: string,
    readonly success: boolean,
    readonly ipAddress: string,
    readonly deviceId?: string,
    readonly failureReason?: string,
    correlationId?: string,
  ) {
    super(userId, 'AuthModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.userId &&
      typeof this.success === 'boolean' &&
      !!this.ipAddress
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      userId: this.userId,
      success: this.success,
      ipAddress: this.ipAddress,
      deviceId: this.deviceId,
      failureReason: this.failureReason,
    };
  }
}

export class LoginAttemptEventStrategy extends LinearVersionStrategy<LoginAttemptEvent> {
  protected currentVersion = 1;

  protected upgradeHandlers: Record<number, (event: any) => any> = {
    // V1 → V2: Add threat detection metadata
    // 1: (event) => ({
    //   ...event,
    //   version: 2,
    //   riskScore: event.success ? 0 : 1,
    //   anomalyDetected: false,
    // }),
  };

  protected downgradeHandlers: Record<number, (event: any) => any> = {
    // V2 → V1: Remove threat detection
    // 2: (event) => {
    //   const { riskScore, anomalyDetected, ...rest } = event;
    //   return { ...rest, version: 1 };
    // },
  };
}

// ============================================================================
// PASSWORD_CHANGED EVENT
// ============================================================================

export class PasswordChangedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.USER_PROFILE_UPDATED;

  constructor(
    readonly userId: string,
    readonly changedAt: Date,
    readonly changedBy: 'USER' | 'ADMIN',
    readonly previousPasswordHash?: string,
    correlationId?: string,
  ) {
    super(userId, 'AuthModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.userId &&
      this.changedAt instanceof Date &&
      !!this.changedBy
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      userId: this.userId,
      changedAt: this.changedAt,
      changedBy: this.changedBy,
      previousPasswordHash: this.previousPasswordHash,
    };
  }
}

export class PasswordChangedEventStrategy extends LinearVersionStrategy<PasswordChangedEvent> {
  protected currentVersion = 1;
  protected upgradeHandlers: Record<number, (event: any) => any> = {};
  protected downgradeHandlers: Record<number, (event: any) => any> = {};
}
