/**
 * Firebase Web App initialization.
 *
 * Lazily initializes the Firebase app and exports the Messaging instance.
 * Only loads when push notification features are actually used.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, type Messaging } from 'firebase/messaging';
import { env } from './env';

// ────────────────────────────────────────────────────────────
// Singleton instances
// ────────────────────────────────────────────────────────────

let firebaseApp: FirebaseApp | null = null;
let messagingInstance: Messaging | null = null;

/**
 * Check if Firebase config is available (all required env vars set).
 */
export function isFirebaseConfigured(): boolean {
      return !!(
            env.FIREBASE_API_KEY &&
            env.FIREBASE_PROJECT_ID &&
            env.FIREBASE_MESSAGING_SENDER_ID &&
            env.FIREBASE_APP_ID
      );
}

/**
 * Get or create the Firebase App singleton.
 * Returns null if Firebase env vars are not configured.
 */
export function getFirebaseApp(): FirebaseApp | null {
      if (!isFirebaseConfigured()) {
            console.warn('[firebase] Firebase config not found — push notifications disabled');
            return null;
      }

      if (!firebaseApp) {
            firebaseApp = initializeApp({
                  apiKey: env.FIREBASE_API_KEY!,
                  authDomain: env.FIREBASE_AUTH_DOMAIN,
                  projectId: env.FIREBASE_PROJECT_ID!,
                  storageBucket: env.FIREBASE_STORAGE_BUCKET,
                  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID!,
                  appId: env.FIREBASE_APP_ID!,
                  measurementId: env.FIREBASE_MEASUREMENT_ID,
            });
      }

      return firebaseApp;
}

/**
 * Get or create the Firebase Messaging singleton.
 * Returns null if Firebase is not configured or browser doesn't support it.
 */
export function getFirebaseMessaging(): Messaging | null {
      if (messagingInstance) return messagingInstance;

      // Service Worker & Notification API required
      if (!('serviceWorker' in navigator) || !('Notification' in window)) {
            console.warn('[firebase] Browser does not support push notifications');
            return null;
      }

      const app = getFirebaseApp();
      if (!app) return null;

      try {
            messagingInstance = getMessaging(app);
            return messagingInstance;
      } catch (error) {
            console.error('[firebase] Failed to initialize messaging:', error);
            return null;
      }
}
