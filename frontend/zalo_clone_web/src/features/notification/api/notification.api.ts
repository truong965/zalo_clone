/**
 * API calls for device token (push notification) management.
 */

import api from '@/lib/axios';
import { API_ENDPOINTS } from '@/constants/api-endpoints';

export interface RegisterDeviceTokenPayload {
      deviceId: string;
      fcmToken: string;
      platform: 'WEB' | 'ANDROID' | 'IOS';
}

/**
 * Register a device token (FCM) with the backend.
 * Uses upsert — safe to call multiple times with the same deviceId.
 */
export async function registerDeviceToken(payload: RegisterDeviceTokenPayload): Promise<void> {
      await api.post(API_ENDPOINTS.DEVICES.REGISTER, payload);
}

/**
 * Remove a device token from the backend (e.g., on logout).
 */
export async function removeDeviceToken(deviceId: string): Promise<void> {
      await api.delete(API_ENDPOINTS.DEVICES.REMOVE(deviceId));
}
