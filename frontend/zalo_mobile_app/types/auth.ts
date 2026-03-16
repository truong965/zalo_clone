export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export type UserProfile = {
      id: string;
      displayName: string;
      phoneNumber: string;
      role?: string;
      avatarUrl?: string | null;
};

export type LoginPayload = {
      phoneNumber: string;
      password: string;
};

export type RegisterPayload = {
      displayName: string;
      phoneNumber: string;
      password: string;
      gender?: Gender;
      dateOfBirth?: string;
};

export type AuthResponse = {
      accessToken: string;
      tokenType: string;
      expiresIn: number;
      user?: UserProfile;
};

export type QrScanResponse = {
      requireConfirm: boolean;
      browser?: string;
      os?: string;
      ipAddress?: string;
      createdAt?: string;
};

export type DeviceSession = {
      deviceId: string;
      deviceName: string;
      platform: string;
      loginMethod: string;
      lastUsedAt?: string;
      ipAddress: string;
      isOnline: boolean;
};
