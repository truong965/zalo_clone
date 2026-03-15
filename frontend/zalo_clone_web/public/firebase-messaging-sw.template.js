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

      self.addEventListener('push', (event) => {
            if (!event.data) return;

            let payload;
            try {
                  payload = event.data.json();
            } catch (e) {
                  console.error('[firebase-messaging-sw] Failed to parse push payload:', e);
                  return;
            }

            const data = payload.data || {};

            event.waitUntil((async function () {
                  await broadcastPushEventToApp(data);

                  const focused = await hasFocusedAppClient();
                  if (focused) return Promise.resolve();

                  if (data.type === 'INCOMING_CALL') {
                        const callerName = data.callerName || 'Ai đó';
                        const callType = data.callType === 'VIDEO' ? 'Video' : 'Thoại';

                        return self.registration.showNotification(`${callerName} đang gọi ${callType}`, {
                              body: 'Nhấn để mở ứng dụng và trả lời cuộc gọi',
                              icon: data.callerAvatar || '/favicon.ico',
                              badge: '/favicon.ico',
                              tag: `incoming-call-${data.callId}`,
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

                  if (data.type === 'NEW_MESSAGE') {
                        const title = data.title || 'Tin nhắn mới';
                        const body = data.body || '';
                        const tag = `msg-${data.conversationId || 'unknown'}`;

                        return self.registration.showNotification(title, {
                              body,
                              icon: '/favicon.ico',
                              badge: '/favicon.ico',
                              tag,
                              renotify: true,
                              data: {
                                    type: 'NEW_MESSAGE',
                                    conversationId: data.conversationId,
                                    conversationType: data.conversationType,
                                    senderId: data.senderId,
                                    url: data.conversationId ? `/chat/${data.conversationId}` : '/',
                              },
                        });
                  }

                  if (data.type === 'FRIEND_REQUEST') {
                        const title = data.title || 'Lời mời kết bạn';
                        const body = data.body || '';

                        return self.registration.showNotification(title, {
                              body,
                              icon: data.fromUserAvatar || '/favicon.ico',
                              badge: '/favicon.ico',
                              tag: `friend-request-${data.requestId || 'unknown'}`,
                              data: {
                                    type: 'FRIEND_REQUEST',
                                    fromUserId: data.fromUserId,
                                    requestId: data.requestId,
                                    url: '/contacts?tab=requests',
                              },
                        });
                  }

                  if (data.type === 'FRIEND_ACCEPTED') {
                        const title = data.title || 'Kết bạn thành công';
                        const body = data.body || '';

                        return self.registration.showNotification(title, {
                              body,
                              icon: data.acceptedByAvatar || '/favicon.ico',
                              badge: '/favicon.ico',
                              tag: `friend-accepted-${data.friendshipId || 'unknown'}`,
                              data: {
                                    type: 'FRIEND_ACCEPTED',
                                    acceptedByUserId: data.acceptedByUserId,
                                    friendshipId: data.friendshipId,
                                    url: '/contacts',
                              },
                        });
                  }

                  if (data.type === 'GROUP_EVENT') {
                        const title = data.title || 'Sự kiện nhóm';
                        const body = data.body || '';

                        return self.registration.showNotification(title, {
                              body,
                              icon: '/favicon.ico',
                              badge: '/favicon.ico',
                              tag: `group-event-${data.conversationId || 'unknown'}-${data.subtype || ''}`,
                              data: {
                                    type: 'GROUP_EVENT',
                                    subtype: data.subtype,
                                    conversationId: data.conversationId,
                                    groupName: data.groupName,
                                    url: data.conversationId ? `/chat/${data.conversationId}` : '/',
                              },
                        });
                  }

                  if (data.title) {
                        return self.registration.showNotification(data.title, {
                              body: data.body || '',
                              icon: '/favicon.ico',
                              badge: '/favicon.ico',
                              data: { url: data.url || '/' },
                        });
                  }

                  return Promise.resolve();
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
