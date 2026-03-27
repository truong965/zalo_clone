export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export type UserProfile = {
      id: string;
      displayName: string;
      phoneNumber: string;
      role?: string;
      avatarUrl?: string | null;
      gender?: Gender;
      dateOfBirth?: string;
      bio?: string | null;
      email?: string | null;
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
      lastUsedAt?: string | Date;
      ipAddress: string;
      isOnline: boolean;
};

export type UpdateUserPayload = {
      displayName?: string;
      avatarUrl?: string;
      gender?: Gender;
      dateOfBirth?: string | Date;
      bio?: string;
      email?: string;
};

export type ChangePasswordPayload = {
      oldPassword: string;
      newPassword: string;
      logoutAllDevices?: boolean;
};

export type ForgotPasswordPayload = {
      email: string;
};

export type VerifyOtpPayload = {
      email: string;
      otp: string;
};

export type ResetPasswordPayload = {
      email: string;
      otp: string;
      newPassword: string;
};
