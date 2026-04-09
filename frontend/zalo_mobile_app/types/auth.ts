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
      twoFactorEnabled: boolean;
      twoFactorMethod: TwoFactorMethod | null;
      twoFactorSetupAt?: string;
      hasTotpSecret: boolean;
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

export type RequestRegisterOtpPayload = {
      phoneNumber: string;
};

export type VerifyRegisterOtpPayload = {
      phoneNumber: string;
      otp: string;
};

export type AuthResponse = {
      accessToken: string;
      tokenType: string;
      expiresIn: number;
      refreshToken?: string;
      user?: UserProfile;
};

export type TwoFactorMethod = 'TOTP' | 'SMS' | 'EMAIL' | 'PUSH';

export type TwoFactorRequiredResponse = {
      status: '2FA_REQUIRED';
      pendingToken: string;
      availableMethods: TwoFactorMethod[];
      preferredMethod: TwoFactorMethod;
      maskedPhone?: string;
      maskedEmail?: string;
      isReactivation?: boolean;
      autoTriggered?: boolean;
};

export type VerifyTwoFactorRequest = {
      pendingToken: string;
      code?: string;
      method: TwoFactorMethod;
      trustDevice?: boolean;
};

export type TwoFactorSetupResponse = {
      otpAuthUri: string;
      qrCodeDataUrl: string;
      expiresIn?: number;
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
      identifier: string;
};

export type ResetPasswordPayload = {
      resetToken: string;
      newPassword: string;
};
