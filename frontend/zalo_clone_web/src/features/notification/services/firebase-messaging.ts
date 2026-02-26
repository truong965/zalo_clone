/**
 * Firebase Cloud Messaging token management.
 *
 * Handles requesting permission, obtaining FCM tokens, registering
 * the Service Worker, and syncing the token with the backend.
 */

import { getToken, deleteToken, onMessage, type MessagePayload } from 'firebase/messaging';
import { getFirebaseMessaging, isFirebaseConfigured } from '@/config/firebase';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import { env } from '@/config/env';
import { registerDeviceToken, removeDeviceToken } from '../api/notification.api';

// ────────────────────────────────────────────────────────────
// Device ID (persistent per browser)
// ────────────────────────────────────────────────────────────

/**
 * Get or create a stable device ID for this browser.
 * Used to identify this specific browser when registering push tokens.
 */
export function getDeviceId(): string {
      let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
      if (!deviceId) {
            deviceId = `web-${crypto.randomUUID()}`;
            localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
      }
      return deviceId;
}

// ────────────────────────────────────────────────────────────
// Service Worker Registration
// ────────────────────────────────────────────────────────────

let swRegistration: ServiceWorkerRegistration | null = null;

/**
 * Register the Firebase Messaging Service Worker.
 * Must be called before requesting FCM tokens.
 */
async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
      if (swRegistration) return swRegistration;
      if (!('serviceWorker' in navigator)) return null;

      try {
            swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
                  scope: '/',
            });
            console.log('[fcm] Service Worker registered:', swRegistration.scope);
            return swRegistration;
      } catch (error) {
            console.error('[fcm] Service Worker registration failed:', error);
            return null;
      }
}

// ────────────────────────────────────────────────────────────
// FCM Token Management
// ────────────────────────────────────────────────────────────

/**
 * Request notification permission and obtain an FCM token.
 * Automatically registers the token with the backend.
 *
 * @returns The FCM token, or null if permission denied / not available.
 */
export async function requestAndRegisterFcmToken(): Promise<string | null> {
      if (!isFirebaseConfigured()) {
            console.warn('[fcm] Firebase not configured — skipping FCM token request');
            return null;
      }

      // 1. Check permission state first (avoid browser prompt in unsupported contexts)
      if (typeof Notification === 'undefined') return null;

      // In Incognito/private modes, notification permission is often auto-denied
      if (Notification.permission === 'denied') {
            // Already blocked — don't prompt again
            return null;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
            // User declined or dismissed — not an error, just a choice
            return null;
      }

      // 2. Register Service Worker
      const sw = await ensureServiceWorker();
      if (!sw) return null;

      // 3. Get FCM token
      const messaging = getFirebaseMessaging();
      if (!messaging) return null;

      try {
            const vapidKey = env.VAPID_PUBLIC_KEY;
            if (!vapidKey) {
                  console.error('[fcm] VAPID public key not configured');
                  return null;
            }

            const currentToken = await getToken(messaging, {
                  vapidKey,
                  serviceWorkerRegistration: sw,
            });

            if (!currentToken) {
                  console.warn('[fcm] No FCM token available (may need permission)');
                  return null;
            }

            // 4. Check if token changed
            const storedToken = localStorage.getItem(STORAGE_KEYS.FCM_TOKEN);
            if (currentToken !== storedToken) {
                  // 5. Register with backend
                  const deviceId = getDeviceId();
                  await registerDeviceToken({
                        deviceId,
                        fcmToken: currentToken,
                        platform: 'WEB',
                  });
                  localStorage.setItem(STORAGE_KEYS.FCM_TOKEN, currentToken);
                  console.log('[fcm] Token registered with backend');
            }

            return currentToken;
      } catch (error) {
            console.error('[fcm] Failed to get FCM token:', error);
            return null;
      }
}

/**
 * Unregister the FCM token (e.g., on logout).
 * Removes from backend and deletes the local token.
 */
export async function unregisterFcmToken(): Promise<void> {
      try {
            // Remove from backend
            const deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
            if (deviceId) {
                  await removeDeviceToken(deviceId).catch(() => {
                        // Best-effort — backend may already have removed it
                  });
            }

            // Delete FCM token from Firebase
            const messaging = getFirebaseMessaging();
            if (messaging) {
                  await deleteToken(messaging).catch(() => { });
            }

            // Clear local storage
            localStorage.removeItem(STORAGE_KEYS.FCM_TOKEN);
      } catch (error) {
            console.error('[fcm] Failed to unregister FCM token:', error);
      }
}

// ────────────────────────────────────────────────────────────
// Foreground Message Handler
// ────────────────────────────────────────────────────────────

/**
 * Set up a listener for messages received while the app is in the foreground.
 * These are NOT shown as browser notifications automatically — handle them in-app.
 *
 * @returns Unsubscribe function.
 */
export function onForegroundMessage(
      callback: (payload: MessagePayload) => void,
): (() => void) | null {
      const messaging = getFirebaseMessaging();
      if (!messaging) return null;

      return onMessage(messaging, callback);
}
