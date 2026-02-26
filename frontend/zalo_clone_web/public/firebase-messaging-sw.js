/* eslint-disable no-restricted-globals */
/**
 * Firebase Messaging Service Worker.
 *
 * Handles background push notifications when the app tab is not focused.
 * For incoming calls: shows a high-priority notification with caller info.
 * For missed calls: shows a standard notification.
 *
 * Note: This file runs in the Service Worker context — no access to DOM or window.
 */

// Firebase compat libraries (required for SW — modular SDK not supported in SW context)
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

// Firebase config — must match the main app config
// These are public values (safe to include in SW)
firebase.initializeApp({
      apiKey: 'AIzaSyDkEJscGzT6ZWLsekgrdgvTY2mP1lVdQc8',
      authDomain: 'zalo-clone-d00f3.firebaseapp.com',
      projectId: 'zalo-clone-d00f3',
      storageBucket: 'zalo-clone-d00f3.firebasestorage.app',
      messagingSenderId: '449588678602',
      appId: '1:449588678602:web:6ec4b8de7258b7bec40933',
});

const messaging = firebase.messaging();

/**
 * Handle background messages (app not focused / tab closed).
 *
 * The FCM SDK automatically shows a notification if the payload contains
 * a `notification` field. For data-only messages (like incoming calls),
 * we handle them manually here.
 */
messaging.onBackgroundMessage((payload) => {
      console.log('[firebase-messaging-sw] Background message received:', payload);

      const data = payload.data || {};

      // ── Incoming Call (data-only message, HIGH priority) ──
      if (data.type === 'INCOMING_CALL') {
            const callerName = data.callerName || 'Ai đó';
            const callType = data.callType === 'VIDEO' ? 'Video' : 'Thoại';

            return self.registration.showNotification(`${callerName} đang gọi ${callType}`, {
                  body: 'Nhấn để mở ứng dụng và trả lời cuộc gọi',
                  icon: data.callerAvatar || '/favicon.ico',
                  badge: '/favicon.ico',
                  tag: `incoming-call-${data.callId}`,
                  requireInteraction: true, // Keep notification visible until user acts
                  renotify: true,
                  data: {
                        type: 'INCOMING_CALL',
                        callId: data.callId,
                        callerId: data.callerId,
                        url: '/', // Navigate to app root (socket will pick up ringing call)
                  },
                  // Vibrate pattern: ring-like → 500ms on, 200ms off, repeated
                  vibrate: [500, 200, 500, 200, 500],
                  actions: [
                        { action: 'open', title: 'Mở ứng dụng' },
                        { action: 'dismiss', title: 'Bỏ qua' },
                  ],
            });
      }

      // ── Missed Call (has notification payload from backend) ──
      if (data.type === 'MISSED_CALL') {
            return self.registration.showNotification(data.title || 'Cuộc gọi nhỡ', {
                  body: data.body || 'Bạn có cuộc gọi nhỡ',
                  icon: data.callerAvatar || '/favicon.ico',
                  badge: '/favicon.ico',
                  tag: `missed-call-${data.callId}`,
                  data: {
                        type: 'MISSED_CALL',
                        callId: data.callId,
                        url: '/',
                  },
            });
      }

      // ── Generic notification (fallback) ──
      if (data.title) {
            return self.registration.showNotification(data.title, {
                  body: data.body || '',
                  icon: '/favicon.ico',
                  badge: '/favicon.ico',
                  data: { url: data.url || '/' },
            });
      }
});

/**
 * Handle notification click — focus or open the app.
 */
self.addEventListener('notificationclick', (event) => {
      const notification = event.notification;
      const data = notification.data || {};
      notification.close();

      // Dismiss action — just close
      if (event.action === 'dismiss') return;

      // Open or focus the app
      const urlToOpen = data.url || '/';

      event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
                  // Try to focus an existing tab
                  for (const client of clients) {
                        if (client.url.includes(self.location.origin) && 'focus' in client) {
                              client.focus();
                              // Post message to the client so it can handle the call
                              client.postMessage({
                                    type: data.type || 'NOTIFICATION_CLICK',
                                    callId: data.callId,
                              });
                              return;
                        }
                  }
                  // No existing tab — open a new one
                  if (self.clients.openWindow) {
                        return self.clients.openWindow(urlToOpen);
                  }
            }),
      );
});
