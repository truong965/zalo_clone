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

/**
 * Initialize Firebase Messaging in SW context.
 * firebase.messaging() must be called to maintain the FCM push subscription
 * (required for token registration in the main app). We do NOT use
 * onBackgroundMessage() because it only fires when there are NO focused
 * clients — meaning a sender's open tab blocks notifications for the
 * offline recipient. Instead, we use the raw push event which always fires.
 */
// eslint-disable-next-line no-unused-vars
const messaging = firebase.messaging();

/**
 * Raw push event handler — fires for ALL incoming FCM pushes, regardless
 * of whether the origin has a focused client tab open.
 *
 * This is crucial for multi-user testing (e.g., sender tab open in incognito
 * while recipient has no tab): onBackgroundMessage would see the incognito
 * tab as an "active client" and skip the notification. The raw push event
 * bypasses that check entirely.
 *
 * Payload structure from Firebase Admin SDK data-only messages:
 *   event.data.json() → { data: { type, ...fields } }
 * For notification+data messages (missed call):
 *   event.data.json() → { notification: { title, body }, data: { type, ...fields } }
 */
self.addEventListener('push', (event) => {
      if (!event.data) return;

      let payload;
      try {
            payload = event.data.json();
      } catch (e) {
            console.error('[firebase-messaging-sw] Failed to parse push payload:', e);
            return;
      }

      console.log('[firebase-messaging-sw] Push received:', payload);

      const data = payload.data || {};

      // Wrap in event.waitUntil so the SW stays alive until showNotification resolves.
      // Using an IIFE keeps all the if/return branches unchanged.
      event.waitUntil((function () {

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

            // ── New Message (data-only, sent by MessageNotificationListener) ──
            if (data.type === 'NEW_MESSAGE') {
                  const title = data.title || 'Tin nhắn mới';
                  const body = data.body || '';
                  // Use conversationId as tag → replaces previous notification for same conversation
                  const tag = `msg-${data.conversationId || 'unknown'}`;

                  return self.registration.showNotification(title, {
                        body,
                        icon: '/favicon.ico',
                        badge: '/favicon.ico',
                        tag,
                        renotify: true, // Re-alert even when replacing same tag
                        data: {
                              type: 'NEW_MESSAGE',
                              conversationId: data.conversationId,
                              senderId: data.senderId,
                              url: data.conversationId ? `/chat/${data.conversationId}` : '/',
                        },
                  });
            }

            // ── Friend Request (data-only, sent by FriendshipNotificationListener) ──
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

            // ── Friend Accepted (data-only, sent by FriendshipNotificationListener) ──
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

            // ── Group Event (data-only, sent by GroupNotificationListener) ──
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

            // ── Generic notification (fallback) ──
            if (data.title) {
                  return self.registration.showNotification(data.title, {
                        body: data.body || '',
                        icon: '/favicon.ico',
                        badge: '/favicon.ico',
                        data: { url: data.url || '/' },
                  });
            }

            return Promise.resolve();
      })()); // end event.waitUntil IIFE
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
                              // For message notifications, navigate to the conversation
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
                              } else {
                                    client.postMessage({
                                          type: data.type || 'NOTIFICATION_CLICK',
                                          callId: data.callId,
                                    });
                              }
                              return client.focus();
                        }
                  }
                  // No existing tab — open a new one
                  if (self.clients.openWindow) {
                        return self.clients.openWindow(urlToOpen);
                  }
            }),
      );
});
