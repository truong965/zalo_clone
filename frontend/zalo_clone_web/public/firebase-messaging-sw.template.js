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
                  // Always broadcast to open tabs for socket/state sync (cache update, badge, etc.)
                  await broadcastPushEventToApp(data);

                  // ── Hybrid payload fast-path ─────────────────────────────────────────
                  // When the FCM payload contains a `notification` block, the browser has
                  // already displayed the OS notification automatically BEFORE this SW
                  // handler was even called — there is no way to intercept or suppress it.
                  //
                  // INCOMING_CALL is the only exception: we want our custom notification UI
                  // with action buttons ("Answer" / "Dismiss"), so we ignore the browser's
                  // built-in rendering (which comes from the notification block) and show our
                  // own after dismissing the browser one.
                  //
                  // All other hybrid types (REMINDER_TRIGGERED, CANCEL_CALL) are already
                  // handled by the browser — SW must NOT show a second notification.
                  if (hasNativeNotification && data.type !== 'INCOMING_CALL') {
                        console.log('[SW] Hybrid payload displayed by browser — skip SW render for:', data.type);
                        return;
                  }

                  // ── Data-only types: SW has full control ─────────────────────────────
                  // Show OS notification only when the user has no visible/focused tab.
                  const focused = await hasFocusedAppClient();
                  if (focused) return;

                  // ── INCOMING_CALL ────────────────────────────────────────────────────
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

                  // ── CANCEL_CALL: Dismiss incoming call notification ──────────────────
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

                  // ── MISSED_CALL ──────────────────────────────────────────────────────
                  if (data.type === 'MISSED_CALL') {
                        return self.registration.showNotification(data.title || 'Cuộc gọi nhỡ', {
                              body: data.body || 'Bạn có cuộc gọi nhỡ',
                              icon: data.callerAvatar || '/favicon.ico',
                              badge: '/favicon.ico',
                              tag: `missed-call-${data.callId}`,
                              data: { type: 'MISSED_CALL', callId: data.callId, url: '/' },
                        });
                  }

                  // ── NEW_MESSAGE (data-only) ──────────────────────────────────────────
                  // Backend now sends data-only for messages so SW has full control.
                  // Show only when no focused/visible tab (checked above).
                  if (data.type === 'NEW_MESSAGE') {
                        console.log('[SW] NEW_MESSAGE data-only, showing notification');
                        return self.registration.showNotification(data.title || 'Tin nhắn mới', {
                              body: data.body || '',
                              icon: '/favicon.ico',
                              badge: '/favicon.ico',
                              tag: `msg-${data.conversationId}`,
                              renotify: true,
                              data: {
                                    type: 'NEW_MESSAGE',
                                    conversationId: data.conversationId,
                                    senderId: data.senderId,
                                    url: '/',
                              },
                        });
                  }

                  // ── FRIEND_REQUEST (data-only) ───────────────────────────────────────
                  if (data.type === 'FRIEND_REQUEST') {
                        return self.registration.showNotification(data.title || 'Lời mời kết bạn', {
                              body: data.body || '',
                              icon: '/favicon.ico',
                              badge: '/favicon.ico',
                              tag: `friend-req-${data.requestId}`,
                              data: { type: 'FRIEND_REQUEST', url: '/' },
                        });
                  }

                  // ── FRIEND_ACCEPTED (data-only) ──────────────────────────────────────
                  if (data.type === 'FRIEND_ACCEPTED') {
                        return self.registration.showNotification(data.title || 'Kết bạn thành công', {
                              body: data.body || '',
                              icon: '/favicon.ico',
                              badge: '/favicon.ico',
                              tag: `friend-acc-${data.friendshipId}`,
                              data: { type: 'FRIEND_ACCEPTED', url: '/' },
                        });
                  }

                  // ── GROUP_EVENT (data-only) ──────────────────────────────────────────
                  if (data.type === 'GROUP_EVENT') {
                        return self.registration.showNotification(data.title || 'Sự kiện nhóm', {
                              body: data.body || '',
                              icon: '/favicon.ico',
                              badge: '/favicon.ico',
                              tag: `group-${data.conversationId}-${data.subtype}`,
                              data: {
                                    type: 'GROUP_EVENT',
                                    conversationId: data.conversationId,
                                    url: '/',
                              },
                        });
                  }

                  // ── REMINDER_TRIGGERED (data-only) ───────────────────────────────────
                  if (data.type === 'REMINDER_TRIGGERED') {
                        return self.registration.showNotification(data.title || '🔔 Nhắc hẹn', {
                              body: data.body || data.content || '',
                              icon: '/favicon.ico',
                              badge: '/favicon.ico',
                              tag: `reminder-${data.reminderId}`,
                              data: {
                                    type: 'REMINDER_TRIGGERED',
                                    conversationId: data.conversationId,
                                    url: '/',
                              },
                        });
                  }

                  // ── Generic data-only fallback ───────────────────────────────────────
                  if (data.title || data.body) {
                        console.log('[SW] Generic data-only fallback for type:', data.type);
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
