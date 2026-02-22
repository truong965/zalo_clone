/**
 * IAM / Auth Module Types
 *
 * User, device, role, permission and authentication request/response types.
 */

// ============================================================================
// ENUMS
// ============================================================================

export const UserStatus = {
      ACTIVE: 'ACTIVE',
      INACTIVE: 'INACTIVE',
      SUSPENDED: 'SUSPENDED',
      DELETED: 'DELETED',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const Gender = {
      MALE: 'MALE',
      FEMALE: 'FEMALE',
      OTHER: 'OTHER',
} as const;

export type Gender = (typeof Gender)[keyof typeof Gender];

export const PrivacyLevel = {
      EVERYONE: 'EVERYONE',
      CONTACTS: 'CONTACTS',
} as const;

export type PrivacyLevel = (typeof PrivacyLevel)[keyof typeof PrivacyLevel];

export const DeviceType = {
      WEB: 'WEB',
      MOBILE: 'MOBILE',
      DESKTOP: 'DESKTOP',
} as const;

export type DeviceType = (typeof DeviceType)[keyof typeof DeviceType];

export const Platform = {
      IOS: 'IOS',
      ANDROID: 'ANDROID',
      WEB: 'WEB',
      WINDOWS: 'WINDOWS',
      MACOS: 'MACOS',
      LINUX: 'LINUX',
} as const;

export type Platform = (typeof Platform)[keyof typeof Platform];

export const TokenRevocationReason = {
      MANUAL_LOGOUT: 'MANUAL_LOGOUT',
      PASSWORD_CHANGED: 'PASSWORD_CHANGED',
      SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
      TOKEN_ROTATION: 'TOKEN_ROTATION',
      ADMIN_ACTION: 'ADMIN_ACTION',
} as const;

export type TokenRevocationReason =
      (typeof TokenRevocationReason)[keyof typeof TokenRevocationReason];

// ============================================================================
// ENTITIES
// ============================================================================

export interface User {
      id: string;
      phoneNumber: string;
      phoneCode: string;
      phoneNumberHash?: string;
      displayName: string;
      avatarUrl?: string;
      bio?: string;
      dateOfBirth?: string;
      gender?: Gender;
      status: UserStatus;
      passwordHash?: string;
      passwordVersion?: number;
      lastSeenAt?: string;
      roleId?: string;

      role?: string;
      permissions?: Permission[];

      createdById?: string;
      updatedById?: string;
      deletedById?: string;
      createdAt: string;
      updatedAt?: string;
      deletedAt?: string;
}

export interface UserToken {
      id: string;
      userId: string;
      refreshTokenHash: string;
      deviceId: string;
      deviceName?: string;
      deviceType?: DeviceType;
      platform?: Platform;
      ipAddress?: string;
      userAgent?: string;
      issuedAt: string;
      expiresAt: string;
      lastUsedAt: string;
      isRevoked: boolean;
      revokedAt?: string;
      revokedReason?: TokenRevocationReason;
      parentTokenId?: string;
}

export interface UserDevice {
      id: string;
      userId: string;
      deviceId: string;
      fcmToken?: string;
      platform?: string;
      lastActiveAt: string;
}

export interface Role {
      id: string;
      name: string;
      description?: string;
      createdAt: string;
      updatedAt: string;
      deletedAt?: string;
      createdById?: string;
      updatedById?: string;
      deletedById?: string;
}

export interface Permission {
      id: string;
      name: string;
      apiPath: string;
      method: string;
      module: string;
      createdAt?: string;
      updatedAt?: string;
      deletedAt?: string;
      createdById?: string;
      updatedById?: string;
      deletedById?: string;
}

export interface PrivacySettings {
      userId: string;
      showProfile: PrivacyLevel;
      whoCanMessageMe: PrivacyLevel;
      whoCanCallMe: PrivacyLevel;
      showOnlineStatus: boolean;
      showLastSeen: boolean;
      createdAt: string;
      updatedAt: string;
      updatedById?: string;
}

// ============================================================================
// REQUEST / RESPONSE DTOs
// ============================================================================

export interface LoginRequest {
      phoneNumber: string;
      password: string;
}

export interface RegisterRequest {
      displayName: string;
      phoneNumber: string;
      password: string;
      gender?: Gender;
      dateOfBirth?: Date;
}

export interface AuthResponse {
      accessToken: string;
      refreshToken: string;
      user: User;
}
