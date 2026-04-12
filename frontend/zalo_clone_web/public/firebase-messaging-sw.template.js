/* eslint-disable no-restricted-globals */
/**
 * Firebase Messaging Service Worker.
 *
 * Generated from template via `npm run generate:firebase-sw`.
 * Do not hardcode Firebase config in source-controlled SW anymore.
 */

importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

const FIREBASE_CONFIG = {
      apiKey: '__VITE_FIREBASE_API_KEY__',
      authDomain: '__VITE_FIREBASE_AUTH_DOMAIN__',
      projectId: '__VITE_FIREBASE_PROJECT_ID__',
      storageBucket: '__VITE_FIREBASE_STORAGE_BUCKET__',
      messagingSenderId: '__VITE_FIREBASE_MESSAGING_SENDER_ID__',
      appId: '__VITE_FIREBASE_APP_ID__',
};

const isConfigured = !!(
      FIREBASE_CONFIG.apiKey &&
      FIREBASE_CONFIG.projectId &&
      FIREBASE_CONFIG.messagingSenderId &&
      FIREBASE_CONFIG.appId
);

if (!isConfigured) {
      console.warn('[firebase-messaging-sw] Firebase config missing. SW push handlers are disabled.');
} else {
      firebase.initializeApp(FIREBASE_CONFIG);

      // eslint-disable-next-line no-unused-vars
      const messaging = firebase.messaging();

      async function hasFocusedAppClient() {
            const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            return clients.some((client) => {
                  if (!client.url.includes(self.location.origin)) return false;
                  if (client.focused === true) return true;
                  return client.visibilityState === 'visible';
            });
      }

      async function broadcastPushEventToApp(data) {
            const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            const payload = {
                  type: 'PUSH_EVENT_RECEIVED',
                  notificationType: data.type || 'GENERIC',
                  data,
                  receivedAt: Date.now(),
            };

            for (const client of clients) {
                  if (!client.url.includes(self.location.origin)) continue;
                  client.postMessage(payload);
            }
      }

      // Use raw push event listener for full control over notification display.
      // This prevents the Firebase compat SDK from double-showing notifications
      // when using messaging.onBackgroundMessage with hybrid payloads.
      self.addEventListener('push', (event) => {
            if (!event.data) return;

            let payload;
            try {
                  payload = event.data.json();
            } catch (e) {
                  console.error('[firebase-messaging-sw] Failed to parse push payload:', e);
                  return;
            }

            // Firebase wraps FCM data inside payload.data
            // For hybrid payloads: payload.notification exists
            // For data-only: payload.data has everything
            const data = payload.data || {};
            const hasNativeNotification = !!payload.notification;

            event.waitUntil((async function () {
                  // Always broadcast to open tabs for socket/state sync
                  await broadcastPushEventToApp(data);

                  const focused = await hasFocusedAppClient();
                  if (focused) return;

                  // CALLS: Always show our custom notification manually for better UI/actions.
                  // - Web doesn't have the same "Doze" throttling for Data pushes as Android.
                  // - Showing manually allows us to embed full call data for the click handler.
                  if (data.type === 'INCOMING_CALL') {
                        console.log('[SW] INCOMING_CALL received', data.callId);
                        const callerName = data.callerName || 'Ai đó';
                        const callType = data.callType === 'VIDEO' ? 'Video' : 'Thoại';

                        return self.registration.showNotification(`${callerName} đang gọi ${callType}`, {
                              body: 'Nhấn để mở ứng dụng và trả lời cuộc gọi',
                              icon: data.callerAvatar || '/favicon.ico',
                              badge: '/favicon.ico',
                              tag: `call-${data.callId}`,
                              requireInteraction: true,
                              renotify: true,
                              data: {
                                    type: 'INCOMING_CALL',
                                    callId: data.callId,
                                    callType: data.callType,
                                    callerId: data.callerId,
                                    callerName: data.callerName,
                                    callerAvatar: data.callerAvatar,
                                    conversationId: data.conversationId,
                                    url: '/',
                              },
                              vibrate: [500, 200, 500, 200, 500],
                              actions: [
                                    { action: 'open', title: 'Mở ứng dụng' },
                                    { action: 'dismiss', title: 'Bỏ qua' },
                              ],
                        });
                  }

                  // CANCEL_CALL: Close the call notification in the tray.
                  if (data.type === 'CANCEL_CALL') {
                        console.log('[SW] CANCEL_CALL received', data.callId);
                        const callTag = `call-${data.callId}`;
                        const existing = await self.registration.getNotifications({ tag: callTag });
                        for (const n of existing) {
                              console.log('[SW] Closing notification', n.tag);
                              n.close();
                        }
                        return;
                  }

                  // HYBRID types (Messages, Reminders, etc.):
                  // If the payload has a `notification` block, the browser handles it.
                  // Only show manually if it's a pure data message (fallback).
                  if (hasNativeNotification) {
                        console.log('[SW] Hybrid payload — Browser natively displaying:', data.type || 'notification');
                        return;
                  }

                  // DATA-ONLY fallback: MISSED_CALL (if it didn't come with a notification block)
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

                  if (data.title || data.body) {
                        console.log('[SW] Rendering manual fallback for data-only message:', data.type);
                        return self.registration.showNotification(data.title || 'Thông báo mới', {
                              body: data.body || data.content || '',
                              icon: '/favicon.ico',
                              data: { ...data, url: '/' },
                        });
                  }
            })());
      });

      self.addEventListener('notificationclick', (event) => {
            const notification = event.notification;
            const data = notification.data || {};
            notification.close();

            if (event.action === 'dismiss') return;

            const urlToOpen = data.url || '/';

            event.waitUntil(
                  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
                        for (const client of clients) {
                               if (client.url.includes(self.location.origin) && 'focus' in client) {
                                     if (data.type === 'NEW_MESSAGE' && data.conversationId) {
                                           client.postMessage({
                                                 type: 'NAVIGATE_TO_CONVERSATION',
                                                 conversationId: data.conversationId,
                                           });
                                     } else if (data.type === 'FRIEND_REQUEST') {
                                           client.postMessage({
                                                 type: 'NAVIGATE_TO_CONTACTS',
                                                 tab: 'requests',
                                           });
                                     } else if (data.type === 'FRIEND_ACCEPTED') {
                                           client.postMessage({
                                                 type: 'NAVIGATE_TO_CONTACTS',
                                           });
                                     } else if (data.type === 'GROUP_EVENT' && data.conversationId) {
                                           client.postMessage({
                                                 type: 'NAVIGATE_TO_CONVERSATION',
                                                 conversationId: data.conversationId,
                                           });
                                     } else if (data.type === 'REMINDER_TRIGGERED' && data.conversationId) {
                                           client.postMessage({
                                                 type: 'NAVIGATE_TO_CONVERSATION',
                                                 conversationId: data.conversationId,
                                           });
                                     } else if (data.type === 'INCOMING_CALL' && data.callId) {
                                           client.postMessage({
                                                 type: 'NAVIGATE_TO_INCOMING_CALL',
                                                 callId: data.callId,
                                                 callType: data.callType,
                                                 callerId: data.callerId,
                                                 callerName: data.callerName,
                                                 callerAvatar: data.callerAvatar,
                                                 conversationId: data.conversationId,
                                           });
                                     } else {
                                           client.postMessage({
                                                 type: data.type || 'NOTIFICATION_CLICK',
                                                 callId: data.callId,
                                           });
                                     }
                                     return client.focus();
                               }
                        }
                        if (self.clients.openWindow) {
                               return self.clients.openWindow(urlToOpen).then((newClient) => {
                                     if (newClient && data.type === 'INCOMING_CALL' && data.callId) {
                                           newClient.postMessage({
                                                 type: 'NAVIGATE_TO_INCOMING_CALL',
                                                 callId: data.callId,
                                                 callType: data.callType,
                                                 callerId: data.callerId,
                                                 callerName: data.callerName,
                                                 callerAvatar: data.callerAvatar,
                                                 conversationId: data.conversationId,
                                           });
                                     }
                                     return undefined;
                               });
                        }
                  }),
            );
      });
}
