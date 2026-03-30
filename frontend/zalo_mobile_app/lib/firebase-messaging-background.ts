import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// This file must be imported at the very top of your entry file (e.g., _layout.tsx)
// to ensure the background handler is registered before the app is initialized.

console.log('[FCM] Registering background handler...');

messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
  console.log('[FCM] Background message received:', remoteMessage);
  const { data } = remoteMessage;
  if (!data) return;

  const title = data.title || (data.type === 'REMINDER_TRIGGERED' ? '🔔 Nhắc hẹn' : 'Zalo');
  const body = data.body || data.content || 'Bạn có thông báo mới';

  const commonContent = {
    title,
    body,
    data: { ...data },
    sound: true,
  };

  const immediateTrigger = {
    channelId: 'default',
  };

  // Handle high-priority tasks in background
  switch (data.type) {
    case 'INCOMING_CALL':
      await Notifications.scheduleNotificationAsync({
        identifier: data.callId,
        content: {
          ...commonContent,
          title: `Cuộc gọi từ ${data.callerName || 'Người dùng'}`,
          body: 'Nhấn để trả lời',
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: immediateTrigger as any,
      });
      break;

    case 'CANCEL_CALL':
      if (data.callId) {
        await Notifications.dismissNotificationAsync(data.callId);
      }
      break;

    case 'MISSED_CALL':
      // Dismiss the incoming call notification if it's still there
      if (data.callId) {
        await Notifications.dismissNotificationAsync(data.callId);
      }
      await Notifications.scheduleNotificationAsync({
        identifier: data.callId ? `missed-${data.callId}` : undefined,
        content: {
          ...commonContent,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: immediateTrigger as any,
      });
      break;

    case 'REMINDER_TRIGGERED':
    case 'NEW_MESSAGE':
    case 'FRIEND_REQUEST':
    case 'FRIEND_ACCEPTED':
    case 'GROUP_EVENT':
      await Notifications.scheduleNotificationAsync({
        content: {
          ...commonContent,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: immediateTrigger as any,
      });
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
  }
});

console.log('[FCM] Background handler registered.');
