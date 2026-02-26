/**
 * Hook: useNotificationPermission
 *
 * Manages push notification permission flow:
 * 1. On mount (when user is authenticated): request permission + register FCM token
 * 2. On unmount / logout: cleanup foreground message listener
 * 3. Handles foreground messages (e.g., incoming call while app is focused)
 *
 * Usage: Mount once at the app root level (e.g., in AuthenticatedLayout).
 */

import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { isFirebaseConfigured } from '@/config/firebase';
import {
      requestAndRegisterFcmToken,
      onForegroundMessage,
      unregisterFcmToken,
} from '../services/firebase-messaging';

/**
 * Options for the notification permission hook.
 */
interface UseNotificationPermissionOptions {
      /** Whether the user is currently authenticated. Token is only requested when true. */
      enabled?: boolean;
}

/**
 * Registers for push notifications when the user is authenticated.
 * Handles foreground message display via toast.
 */
export function useNotificationPermission(
      options: UseNotificationPermissionOptions = {},
) {
      const { enabled = true } = options;
      const unsubscribeRef = useRef<(() => void) | null>(null);
      const tokenRequestedRef = useRef(false);

      const setupPushNotifications = useCallback(async () => {
            if (!enabled || !isFirebaseConfigured()) return;
            if (tokenRequestedRef.current) return; // Already requested this session
            tokenRequestedRef.current = true;

            // Request permission + register token
            const token = await requestAndRegisterFcmToken();
            if (!token) return;

            // Listen for foreground messages
            unsubscribeRef.current = onForegroundMessage((payload) => {
                  const data = payload.data || {};

                  // Incoming call while app is focused — socket handles this, ignore push
                  if (data.type === 'INCOMING_CALL') return;

                  // Missed call or generic notification — show toast
                  const title = payload.notification?.title || data.title || 'Thông báo';
                  const body = payload.notification?.body || data.body || '';

                  toast.info(title, { description: body });
            });
      }, [enabled]);

      useEffect(() => {
            void setupPushNotifications();

            return () => {
                  if (unsubscribeRef.current) {
                        unsubscribeRef.current();
                        unsubscribeRef.current = null;
                  }
            };
      }, [setupPushNotifications]);

      return { unregisterFcmToken };
}
