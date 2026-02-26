/**
 * Auth Service - API calls for authentication
 * Handles login, register, refresh, logout, sessions management
 */

import { API_ENDPOINTS } from '@/constants/api-endpoints';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import api from '@/lib/axios';
import type { LoginRequest, RegisterRequest, User } from '@/types/api';

// ============================================================================
// TYPES
// ============================================================================


export interface AuthResponseData {
      accessToken: string;
      expiresIn: number;
      tokenType: string;
      user: User;
}

export interface SessionInfo {
      id: string;
      userId: string;
      deviceId: string;
      deviceName: string;
      deviceType: string;
      platform: string;
      ipAddress: string;
      lastUsedAt: string;
      createdAt: string;
      isActive: boolean;
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
       * Login with phone and password
       * ✅ Access token returned in response body
       * ✅ Refresh token set as httpOnly cookie (secure, httpOnly, sameSite)
       */
      async login(payload: LoginRequest) {
            const response = await api.post(API_ENDPOINTS.AUTH.LOGIN, payload);
            const data = response.data.data as AuthResponseData;

            // Store access token (Refresh token is httpOnly, managed by browser)
            localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken);
            localStorage.setItem(STORAGE_KEYS.EXPIRES_IN, data.expiresIn.toString());

            return data;
      },

      /**
       * Refresh access token
       * ✅ Refresh token automatically sent via httpOnly cookie
       * ✅ Axios interceptor handles response
       */
      async refresh() {
            const response = await api.post(API_ENDPOINTS.AUTH.REFRESH, {});
            const data = response.data.data as Omit<AuthResponseData, 'user'>;

            // Update stored access token
            localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken);
            localStorage.setItem(STORAGE_KEYS.EXPIRES_IN, data.expiresIn.toString());

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
       * Get all active sessions for current user
       */
      async getSessions() {
            const response = await api.get(API_ENDPOINTS.AUTH.SESSIONS);
            return response.data.data as SessionInfo[];
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
                  // Clear tokens from localStorage
                  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
                  localStorage.removeItem(STORAGE_KEYS.EXPIRES_IN);
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
       * Check if user is authenticated
       */
      isAuthenticated(): boolean {
            return !!localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      },

      /**
       * Get stored access token
       */
      getAccessToken(): string | null {
            return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      },

      /**
       * Validate access token expiry
       */
      isTokenExpired(): boolean {
            const expiresIn = localStorage.getItem(STORAGE_KEYS.EXPIRES_IN);
            if (!expiresIn) return true;

            // In real implementation, you'd check the JWT exp claim
            // For now, we rely on server response validation
            return false;
      },

      /**
       * Clear all auth data (logout)
       */
      clearAuthData() {
            localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
            localStorage.removeItem(STORAGE_KEYS.EXPIRES_IN);
      },
};
