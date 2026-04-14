import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// This file must be imported at the very top of your entry file (e.g., _layout.tsx)
// to ensure the background handler is registered before the app is initialized.

console.log('[FCM] Registering background handler...');

messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
  console.log('[FCM] Background message received:', remoteMessage);
  const { data, notification } = remoteMessage;
  if (!data) return;

  // Hybrid payloads: OS handles the notification block natively.
  // Data-only payloads: We must handle them manually.
  const hasNativeNotification = !!notification;

  const commonContent = {
    title: data.title || (data.type === 'REMINDER_TRIGGERED' ? '🔔 Nhắc hẹn' : 'Zalo'),
    body: data.body || data.content || 'Bạn có thông báo mới',
    data: { ...data },
    sound: true,
  };

  const immediateTrigger = { channelId: 'default' };

  switch (data.type) {
    case 'INCOMING_CALL':
      // Call is now a HYBRID payload (notification + data).
      // OS displays the notification immediately via FCM — this is what fixes the 3-5 min delay.
      // setBackgroundMessageHandler still fires for data processing (e.g., setting call state),
      // but we do NOT need to schedule another notification via expo-notifications.
      if (!hasNativeNotification) {
        // Fallback: old data-only path or foreground
        Notifications.scheduleNotificationAsync({
          identifier: data.callId,
          content: {
            ...commonContent,
            title: `Cuộc gọi từ ${data.callerName || 'Người dùng'}`,
            body: 'Nhấn để trả lời',
            priority: Notifications.AndroidNotificationPriority.MAX,
          },
          trigger: immediateTrigger as any,
        }).catch((e) => console.warn('[FCM] scheduleNotification (call fallback) failed:', e));
      }
      break;

    case 'CANCEL_CALL':
      if (data.callId) {
        await Notifications.dismissNotificationAsync(data.callId);
      }
      break;

    case 'MISSED_CALL':
      if (data.callId) {
        await Notifications.dismissNotificationAsync(data.callId);
      }
      // Only render manual missed call if it didn't come with a system notification
      if (!hasNativeNotification) {
        await Notifications.scheduleNotificationAsync({
          identifier: data.callId ? `missed-${data.callId}` : undefined,
          content: {
            ...commonContent,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: immediateTrigger as any,
        });
      }
      break;

    case 'REMINDER_CREATED':
    case 'REMINDER_UPDATED':
      if (data.remindAt) {
        const triggerDate = new Date(data.remindAt);
        if (triggerDate.getTime() > Date.now()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '🔔 Nhắc hẹn',
              body: data.content || 'Bạn có nhắc hẹn',
              data: { ...data, type: 'REMINDER_TRIGGERED' },
            },
            trigger: { 
              type: Notifications.SchedulableTriggerInputTypes.DATE, 
              date: triggerDate,
              channelId: 'default'
            },
          });
        }
      }
      break;

    case 'REMINDER_TRIGGERED':
      // Backend sends REMINDER_TRIGGERED as HYBRID payload (notification + data),
      // so Android OS already displayed the notification from the `notification` block.
      // We do NOT schedule via expo-notifications to avoid duplicate.
      // The `setBackgroundMessageHandler` still fires for data-routing purposes
      // (e.g., updating reminder badge state), but display is OS-handled.
      if (!hasNativeNotification) {
        // Fallback: data-only path (should not happen with current backend config)
        await Notifications.scheduleNotificationAsync({
          content: {
            ...commonContent,
            title: data.title || '🔔 Nhắc hẹn',
            priority: Notifications.AndroidNotificationPriority.MAX,
          },
          trigger: immediateTrigger as any,
        });
      }
      break;

    default:
      // NEW_MESSAGE, FRIEND_REQUEST, FRIEND_ACCEPTED, GROUP_EVENT, etc.
      // Backend sends these as DATA-ONLY payloads (no notification block).
      // setBackgroundMessageHandler is responsible for rendering the OS notification.
      //
      // Guard: if somehow a hybrid payload reaches here, the OS already displayed
      // the notification — skip to prevent duplicate.
      if (hasNativeNotification) {
        console.log('[FCM] Hybrid in default case — OS handled display, skipping for type:', data.type);
        break;
      }

      if (data.title || data.body || data.content) {
        const title =
          data.title ||
          (data.type === 'NEW_MESSAGE'
            ? 'Tin nhắn mới'
            : data.type === 'FRIEND_REQUEST'
              ? 'Lời mời kết bạn'
              : data.type === 'FRIEND_ACCEPTED'
                ? 'Kết bạn thành công'
                : data.type === 'GROUP_EVENT'
                  ? data.groupName || 'Sự kiện nhóm'
                  : 'Zalo');
        const body = data.body || data.content || 'Bạn có thông báo mới';

        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data: { ...data },
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: immediateTrigger as any,
        });
      }
      break;
  }
});

console.log('[FCM] Background handler registered.');
