import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useCallStore } from '@/features/calls/stores/call.store';
import { useAuth } from '@/providers/auth-provider';
import { useReminderStore } from '@/features/chats/stores/reminder.store';
import Toast from 'react-native-toast-message';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useLoginApprovalStore } from '@/features/auth/stores/login-approval.store';
import { useContactSyncStore } from '@/features/contacts/stores/contact-sync.store';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let messagingInstance: any;
let onMessageModular: any;
try {
  if (!isExpoGo) {
    const messagingModule = require('@react-native-firebase/messaging');
    messagingInstance = messagingModule.getMessaging();
    onMessageModular = messagingModule.onMessage;
  }
} catch {
  // Silent – Expo Go or missing native module
}

export function usePushNotifications() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { setIncomingCall, resetCallState, callId: currentCallId } = useCallStore();

  useEffect(() => {
    if (!messagingInstance || !onMessageModular) return;

    const unsub = onMessageModular(messagingInstance, async (remoteMessage: any) => {
      console.log('[FCM] Foreground message:', remoteMessage);
      const { data } = remoteMessage;
      if (!data) return;

      switch (data.type) {
        case 'INCOMING_CALL':
          // Only handle if we aren't already in a call
          if (useCallStore.getState().callStatus === 'IDLE') {
            setIncomingCall({
              callId: data.callId,
              callType: data.callType,
              conversationId: data.conversationId,
              callerInfo: {
                id: data.callerId,
                displayName: data.callerName,
                avatarUrl: data.callerAvatar || null,
              },
              receivedAt: Date.now(),
            });
            const isGroup = data.isGroupCall === 'true';
            const groupName = data.groupName;

            Toast.show({
              type: 'info',
              text1: isGroup ? '📞 Cuộc gọi nhóm mới' : '📞 Cuộc gọi mới',
              text2: isGroup 
                ? `${data.callerName} đang gọi trong nhóm ${groupName || 'của bạn'}`
                : `Đang nhận cuộc gọi từ ${data.callerName}`,
              visibilityTime: 5000,
            });
          }
          break;

        case 'CANCEL_CALL':
          // ONLY reset if we are still in RINGING state. 
          // If we already accepted (ACTIVE), this is just a cleanup push for other devices.
          if (useCallStore.getState().callId === data.callId && useCallStore.getState().callStatus === 'RINGING') {
            console.log('[FCM] CANCEL_CALL received, resetting RINGING state');
            resetCallState();
          }
          break;

        case 'NEW_MESSAGE':
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          Toast.show({
            type: 'info',
            text1: data.title || data.senderName || 'Tin nhắn mới',
            text2: data.body || data.messageContent || 'Bạn có tin nhắn mới',
            onPress: () => {
              // Future: navigate to conversationId
              Toast.hide();
            },
          });
          break;

        case 'FRIEND_REQUEST':
        case 'FRIEND_ACCEPTED':
          queryClient.invalidateQueries({ queryKey: ['friendships'] });
          queryClient.invalidateQueries({ queryKey: ['invitations'] });
          Toast.show({
            type: 'success',
            text1: data.title || 'Kết bạn',
            text2: data.body || 'Bạn có thông báo mới về lời mời kết bạn',
          });
          break;

        case 'MISSED_CALL':
          // If we were ringing for this call, reset the state
          if (useCallStore.getState().callId === data.callId && useCallStore.getState().callStatus === 'RINGING') {
            console.log('[FCM] MISSED_CALL received, resetting RINGING state');
            resetCallState();
          }
          Toast.show({
            type: 'info',
            text1: data.title || 'Cuộc gọi nhỡ',
            text2: data.body || `Cuộc gọi nhỡ từ ${data.callerName}`,
          });
          break;

        case 'GROUP_EVENT':
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          Toast.show({
            type: 'info',
            text1: data.title || 'Nhóm',
            text2: data.body || 'Có cập nhật mới trong nhóm',
          });
          break;
        
        case 'LOGIN_APPROVAL':
          // Update store to show modal
          useLoginApprovalStore.getState().showRequest({
            pendingToken: data.pendingToken,
            deviceName: data.deviceName,
            location: data.location,
            ipAddress: data.ipAddress,
            timestamp: data.timestamp || new Date().toISOString(),
          });

          Toast.show({
              type: 'info',
              text1: '🔐 Yêu cầu đăng nhập mới',
              text2: `Thiết bị ${data.deviceName} đang yêu cầu đăng nhập`,
              visibilityTime: 10000,
          });
          break;

        case 'CONTACTS_SYNCED':
          queryClient.invalidateQueries({ queryKey: ['contacts'] });
          useContactSyncStore.getState().setSuccess();
          Toast.show({
            type: 'success',
            text1: 'Đồng bộ hoàn tất',
            text2: `Đã tìm thấy ${data.matchedCount || 0} liên lạc mới từ danh bạ`,
          });
          break;

        default:
          // Other types (like REMINDER_TRIGGERED) are handled in their own hooks
          break;
      }
    });

    return unsub;
  }, [queryClient, user?.id, setIncomingCall, resetCallState]);

  // Handle background notification clicks for navigation or overlay
  useEffect(() => {
    if (isExpoGo || !Notifications) return;

    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      console.log('[Notifications] Response received:', data);
      
      if (data?.type === 'REMINDER_TRIGGERED') {
        const { pushAlert } = useReminderStore.getState();
        pushAlert({
          id: `tap-${data.reminderId}-${Date.now()}`,
          reminderId: data.reminderId,
          content: data.content || response.notification.request.content.body || '',
          conversationId: data.conversationId,
          creatorId: data.creatorId,
          triggeredAt: new Date().toISOString(),
        });
      } else if (data?.type === 'INCOMING_CALL') {
        // If the user clicked a call notification, ensure the app shows the call UI
        // especially useful for cold starts or if the app was suspended.
        if (useCallStore.getState().callStatus === 'IDLE') {
          console.log('[Notifications] INCOMING_CALL click detected, setting state');
          setIncomingCall({
            callId: data.callId,
            callType: data.callType,
            conversationId: data.conversationId,
            callerInfo: {
              id: data.callerId,
              displayName: data.callerName,
              avatarUrl: data.callerAvatar || null,
            },
            receivedAt: Date.now(),
          });
        }
      }

      // Future: handle NEW_MESSAGE click -> navigate to chat
    });

    return () => sub.remove();
  }, [setIncomingCall]);

  // Handle background notification clicks for FCM native notifications
  useEffect(() => {
    if (!messagingInstance) return;

    function handleFCMClick(data: any) {
      if (!data) return;
      
      if (data.type === 'REMINDER_TRIGGERED') {
        const { pushAlert } = useReminderStore.getState();
        pushAlert({
          id: `tap-${data.reminderId}-${Date.now()}`,
          reminderId: data.reminderId,
          content: data.content || data.body || '',
          conversationId: data.conversationId,
          creatorId: data.creatorId,
          triggeredAt: new Date().toISOString(),
        });
      } else if (data.type === 'INCOMING_CALL') {
        if (useCallStore.getState().callStatus === 'IDLE') {
          console.log('[FCM] INCOMING_CALL click detected (native), setting state');
          setIncomingCall({
            callId: data.callId,
            callType: data.callType,
            conversationId: data.conversationId,
            callerInfo: {
              id: data.callerId,
              displayName: data.callerName,
              avatarUrl: data.callerAvatar || null,
            },
            receivedAt: Date.now(),
          });
        }
      }
    }

    let unsub: any;
    try {
      const messagingModule = require('@react-native-firebase/messaging');
      unsub = messagingModule.default().onNotificationOpenedApp((remoteMessage: any) => {
        console.log('[FCM] Notification clicked (background):', remoteMessage);
        handleFCMClick(remoteMessage.data);
      });

      messagingModule.default().getInitialNotification().then((remoteMessage: any) => {
        if (remoteMessage) {
          console.log('[FCM] Notification clicked (killed):', remoteMessage);
          handleFCMClick(remoteMessage.data);
        }
      });
    } catch {}

    return () => {
      if (unsub) unsub();
    };
  }, [setIncomingCall]);
}
