/**
 * Auth Service - API calls for authentication
 * Handles login, register, refresh, logout, sessions management
 */

import { API_ENDPOINTS } from '@/constants/api-endpoints';
import api from '@/lib/axios';
import type { 
      LoginRequest, 
      RegisterRequest, 
      User, 
      ForgotPasswordRequest, 
      ResetPasswordRequest, 
      ChangePasswordRequest, 
      RequestRegisterOtpRequest,
      VerifyRegisterOtpRequest,
      TwoFactorRequiredResponse,
      VerifyTwoFactorRequest
} from '@/types/api';


// ============================================================================
// TYPES
// ============================================================================


export interface AuthResponseData {
      accessToken: string;
      expiresIn: number;
      tokenType: string;
      user: User;
}


export interface QrStatusResponse {
      status: 'PENDING' | 'SCANNED' | 'APPROVED' | 'CANCELLED' | 'EXPIRED';
      ticket?: string;
}

export interface DeviceSession {
      deviceId: string;
      deviceName: string;
      platform: string;
      loginMethod: string;
      lastUsedAt: string;
      ipAddress: string;
      isOnline: boolean;
}

// ============================================================================
// AUTH SERVICE
// ============================================================================

export const authService = {
      /**
       * Register new user
       */
      async register(payload: RegisterRequest) {
            const response = await api.post(API_ENDPOINTS.AUTH.REGISTER, payload);
            return response.data.data as User;
      },

      /**
       * Request registration OTP
       */
      async requestRegisterOtp(payload: RequestRegisterOtpRequest) {
            const response = await api.post(API_ENDPOINTS.AUTH.REGISTER_OTP_REQUEST, payload);
            return response.data;
      },

      /**
       * Verify registration OTP
       */
      async verifyRegisterOtp(payload: VerifyRegisterOtpRequest) {
            const response = await api.post(API_ENDPOINTS.AUTH.REGISTER_OTP_VERIFY, payload);
            return response.data;
      },

      /**
       * Login with phone and password
       * ✅ Access token returned in response body
       * ✅ Refresh token set as httpOnly cookie (secure, httpOnly, sameSite)
       * ✅ For 2FA, returns 202 Accepted and a pendingToken
       */
      async login(payload: LoginRequest): Promise<AuthResponseData | TwoFactorRequiredResponse> {
        const response = await api.post(API_ENDPOINTS.AUTH.LOGIN, payload);
        
        // Handle 202 Accepted (2FA Required)
        if (response.status === 202) {
          return response.data.data as TwoFactorRequiredResponse;
        }

        const data = response.data.data as AuthResponseData;
        return data;
      },

      /**
       * Verify 2FA code or Push
       */
      async verify2fa(payload: VerifyTwoFactorRequest) {
        const response = await api.post(API_ENDPOINTS.AUTH.TWO_FACTOR_VERIFY, payload);
        const data = response.data.data;

        // If it's a login/reactivation success, it will have accessToken
        if (data.accessToken) {
          // Note: Token management moved to authStore/axios interceptor
        }

        return data; // Return full data for specialized flows (like forgot password)
      },

      /**
       * Trigger SMS 2FA challenge
       */
      async send2faSmsChallenge(pendingToken: string) {
        const response = await api.post(API_ENDPOINTS.AUTH.TWO_FACTOR_CHALLENGE_SMS, { pendingToken });
        return response.data.data as { maskedPhone: string };
      },

      /**
       * Trigger Email 2FA challenge
       */
      async send2faEmailChallenge(pendingToken: string) {
        const response = await api.post(API_ENDPOINTS.AUTH.TWO_FACTOR_CHALLENGE_EMAIL, { pendingToken });
        return response.data.data as { maskedEmail: string };
      },

      /**
       * Trigger Totp (Authenticator) method activation
       */
      async send2faTotpChallenge(pendingToken: string) {
        const response = await api.post(API_ENDPOINTS.AUTH.TWO_FACTOR_CHALLENGE_TOTP, { pendingToken });
        return response.data;
      },
 
      /**
       * Trigger Push 2FA challenge
       */
      async send2faPushChallenge(pendingToken: string) {
        const response = await api.post(API_ENDPOINTS.AUTH.TWO_FACTOR_CHALLENGE_PUSH, { pendingToken });
        return response.data;
      },


      /**
       * Refresh access token
       * ✅ Refresh token automatically sent via httpOnly cookie
       * ✅ Axios interceptor handles response
       */
      async refresh() {
            const response = await api.post(API_ENDPOINTS.AUTH.REFRESH, {});
            const data = response.data.data as Omit<AuthResponseData, 'user'>;
            return data;
      },

      /**
       * Generate new QR login session
       * @param socketId Web's socket ID (unauthenticated) to receive real-time updates
       */
      async generateQr(socketId: string) {
            const response = await api.post(`${API_ENDPOINTS.AUTH.QR_GENERATE}?socketId=${socketId}`);
            return response.data.data as { qrSessionId: string; deviceTrackingId: string };
      },

      /**
       * Fallback polling if WebSocket drops
       */
      async getQrStatus(qrSessionId: string) {
            const response = await api.get(API_ENDPOINTS.AUTH.QR_STATUS(qrSessionId));
            return response.data.data as QrStatusResponse;
      },

      /**
       * Exchange QR ticket for tokens
       * @param deviceId - deviceTrackingId from generate response
       */
      async exchangeQrTicket(ticket: string, qrSessionId: string, deviceId?: string) {
            const response = await api.post(API_ENDPOINTS.AUTH.QR_EXCHANGE, {
                  ticket,
                  qrSessionId,
                  deviceId: deviceId || 'unknown',
            });
            const data = response.data.data as AuthResponseData;
            return data;
      },

      /**
       * Get current user profile
       */
      async getProfile() {
            const response = await api.get(API_ENDPOINTS.AUTH.ME);
            return response.data.data as User;
      },

      /**
       * Update current user profile
       */
      async updateProfile(id: string, payload: Partial<User>) {
            const response = await api.patch(API_ENDPOINTS.USERS.UPDATE_PROFILE(id), payload);
            return response.data.data as User;
      },

      /**
       * Get all active sessions for current user
       */
      async getSessions() {
            const response = await api.get(API_ENDPOINTS.AUTH.SESSIONS);
            return response.data.data as DeviceSession[];
      },

      /**
       * Logout from current device
       * ✅ Revokes refresh token on server
       * ✅ Clears refresh token cookie
       */
      async logout() {
            try {
                  // Unregister FCM token before server logout (needs auth header)
                  const { unregisterFcmToken } = await import('@/features/notification/services/firebase-messaging');
                  await unregisterFcmToken().catch(() => { });
            } catch {
                  // Firebase not configured or import failed — continue logout
            }
            try {
                  await api.post(API_ENDPOINTS.AUTH.LOGOUT, {});
            } finally {
                  // Access Token is in-memory, will be cleared by authStore.logout()
                  // Refresh token cookie is cleared by server (httpOnly)
            }
      },

      /**
       * Revoke specific device session (remote logout)
       */
      async revokeSession(deviceId: string) {
            await api.delete(API_ENDPOINTS.AUTH.REVOKE_SESSION(deviceId));
      },

      /**
       * Check if user is authenticated (Check store instead)
       */
      isAuthenticated(): boolean {
            // This will be handled by authStore combining persist+silent-refresh
            return false; 
      },

      /**
       * Get stored access token
       */
      getAccessToken(): string | null {
            return null; // Should use authStore.getState().accessToken
      },

      /**
       * Validate access token expiry
       */
      isTokenExpired(): boolean {
            return false;
      },

      /**
       * Clear all auth data (No-op, moved to store.reset())
       */
      clearAuthData() {
            // No-op
      },

      /**
       * Forgot password - request challenge
       */
      async forgotPassword(payload: ForgotPasswordRequest): Promise<void | TwoFactorRequiredResponse> {
            const response = await api.post(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, payload);
            if (response.status === 202) {
                  return response.data.data as TwoFactorRequiredResponse;
            }
      },


      /**
       * Reset password using resetToken
       */
      async resetPassword(payload: ResetPasswordRequest) {
            const response = await api.post(API_ENDPOINTS.AUTH.RESET_PASSWORD, payload);
            return response.data;
      },

      /**
       * Change password
       */
      async changePassword(payload: ChangePasswordRequest) {
            const response = await api.post(API_ENDPOINTS.AUTH.CHANGE_PASSWORD, payload);
            const data = response.data.data as { accessToken: string; expiresIn: number; message: string };
            // Save new tokens so the current device continues to work
            if (data.accessToken) {
                  // Token management moved to store
            }
            return data;
      },

      /**
       * Deactivate current account (requires password)
       */
      async deactivateAccount(password: string) {
            await api.post(API_ENDPOINTS.USERS.DEACTIVATE, { password });
            this.clearAuthData();
      },

      /**
       * Permanently delete current account (requires password)
       */
      async deleteAccount(id: string, password: string) {
            // Note: DELETE request with body is supported by Axios/Express 
            // but we must pass data explicitly in config for some environments
            await api.delete(API_ENDPOINTS.USERS.DELETE_SELF(id), { data: { password } });
            this.clearAuthData();
      },

      /**
       * Update preferred 2FA method
       */
      async update2faMethod(method: 'TOTP' | 'SMS' | 'EMAIL', password?: string) {
            const response = await api.patch(API_ENDPOINTS.AUTH.TWO_FACTOR_UPDATE_METHOD, { method, password });
            return response.data;
      },

      /**
       * Request email change (requires password)
       */
      async requestEmailChange(newEmail: string, password: string) {
            const response = await api.post(API_ENDPOINTS.AUTH.EMAIL_CHANGE_REQUEST, { newEmail, password });
            return response.data;
      },

      /**
       * Confirm email change (requires OTP)
       */
      async confirmEmailChange(otp: string) {
            const response = await api.post(API_ENDPOINTS.AUTH.EMAIL_CHANGE_CONFIRM, { otp });
            return response.data;
      },

      /**
       * Initialize TOTP setup (returns QR code)
       */
      async init2faSetup() {
            const response = await api.post(API_ENDPOINTS.AUTH.TWO_FACTOR_SETUP_INIT);
            return response.data;
      },

      /**
       * Confirm TOTP setup (verifies token and enables 2FA)
       */
      async confirm2faSetup(token: string) {
            const response = await api.post(API_ENDPOINTS.AUTH.TWO_FACTOR_SETUP_CONFIRM, { token });
            return response.data;
      },
};
