import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mobileApi } from '@/services/api';
import { REMINDERS_BASE_KEY } from './use-reminders';
import { useSocket } from '@/providers/socket-provider';
import { useAuth } from '@/providers/auth-provider';
import type { ReminderAlert } from '../components/reminder/reminder-alert-overlay';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let Notifications: any;
if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
  } catch (e) {
    // silent
  }
}

// ── Firebase (optional — works only in dev-builds, not Expo Go) ────
let messaging: any;
try {
  messaging = require('@react-native-firebase/messaging').default;
} catch {
  // Silent – Expo Go or missing native module
}

// ── AsyncStorage key for reminderId → notificationId mapping ───────
const SCHEDULED_MAP_KEY = '@reminder_scheduled_map';

async function getScheduledMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULED_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveScheduledMap(map: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(SCHEDULED_MAP_KEY, JSON.stringify(map));
  } catch {
    // silent
  }
}

// ── Hook ───────────────────────────────────────────────────────────
export function useReminderNotifications() {
  const { isConnected, socket } = useSocket();
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();
  const currentUserId = user?.id ?? null;
  const didInitRef = useRef(false);

  // Alerts shown as full-screen modal overlay
  const [alerts, setAlerts] = useState<ReminderAlert[]>([]);

  // ── Push alert (dedup by reminderId) ─────────────────────────────
  const pushAlert = useCallback((alert: ReminderAlert) => {
    setAlerts((prev) => {
      if (prev.some((a) => a.reminderId === alert.reminderId)) return prev;
      return [...prev, alert];
    });

    // Also trigger a system notification immediately for background visibility.
    // BUT only if it didn't come from a local notification itself (to avoid loop/duplicates).
    const isLocalSource = alert.id.startsWith('local-');
    if (!isExpoGo && Notifications && !isLocalSource) {
      void Notifications.scheduleNotificationAsync({
        content: {
          title: '🔔 Nhắc hẹn',
          body: alert.content || 'Bạn có nhắc hẹn',
          data: {
            reminderId: alert.reminderId,
            content: alert.content,
            conversationId: alert.conversationId,
            type: 'REMINDER_TRIGGERED',
            source: 'immediate_local',
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          channelId: 'default',
        } as any,
        trigger: null, // show immediately
      }).catch(() => { /* silent */ });
    }
  }, []);

  const dismissAlert = useCallback((alert: ReminderAlert) => {
    setAlerts((prev) => prev.filter((a) => a.reminderId !== alert.reminderId));
  }, []);

  const acknowledgeAlert = useCallback(
    (alert: ReminderAlert) => {
      // Remove from UI immediately
      setAlerts((prev) => prev.filter((a) => a.reminderId !== alert.reminderId));

      if (!accessToken) return;
      void mobileApi
        .updateReminder(alert.reminderId, { isCompleted: true }, accessToken)
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
        })
        .catch(() => { /* silent */ });
    },
    [accessToken, queryClient],
  );

  // ── Local notification scheduling ────────────────────────────────
  const cancelLocalReminder = useCallback(async (reminderId: string) => {
    try {
      const map = await getScheduledMap();
      const notifId = map[reminderId];
      if (notifId) {
        await Notifications.cancelScheduledNotificationAsync(notifId);
        delete map[reminderId];
        await saveScheduledMap(map);
      }
    } catch { /* silent */ }
  }, []);

  const scheduleLocalReminder = useCallback(async (reminder: any) => {
    try {
      const triggerDate = new Date(reminder.remindAt);
      if (triggerDate.getTime() <= Date.now() + 1000) return; // already passed or too soon (within 1s)

      // Cancel any existing schedule for this reminder
      await cancelLocalReminder(reminder.id);

      const notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🔔 Nhắc hẹn',
          body: reminder.content || 'Bạn có nhắc hẹn',
          data: {
            reminderId: reminder.id,
            content: reminder.content,
            conversationId: reminder.conversationId,
            type: 'REMINDER_TRIGGERED',
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          channelId: 'default',
        } as any,
        trigger: triggerDate as any,
      });

      const map = await getScheduledMap();
      map[reminder.id] = notifId;
      await saveScheduledMap(map);
    } catch { /* silent */ }
  }, [cancelLocalReminder]);

  // ── Full sync: fetch all active reminders, schedule locally ──────
  const syncAllReminders = useCallback(async () => {
    if (!accessToken) return;
    try {
      const all = await mobileApi.getReminders(accessToken, false);
      const active = all.filter((r: any) => !r.isCompleted && !r.isTriggered);

      const currentMap = await getScheduledMap();
      const activeIds = new Set(active.map((r: any) => r.id));

      // Cancel stale
      for (const id of Object.keys(currentMap)) {
        if (!activeIds.has(id)) {
          await cancelLocalReminder(id);
        }
      }

      // Schedule upcoming
      for (const reminder of active) {
        await scheduleLocalReminder(reminder);
      }
    } catch { /* silent */ }
  }, [accessToken, cancelLocalReminder, scheduleLocalReminder]);

  // ── Fetch undelivered / missed reminders → push to overlay ──────
  const fetchMissedReminders = useCallback(async () => {
    if (!accessToken) return;
    try {
      const missed = await mobileApi.getUndelivered(accessToken);
      for (const reminder of missed) {
        pushAlert({
          id: `missed-${reminder.id}`,
          reminderId: reminder.id,
          content: reminder.content,
          conversationId: (reminder as any).conversationId,
          creatorId: (reminder as any).userId,
          triggeredAt: (reminder as any).triggeredAt ?? (reminder as any).remindAt,
        });
      }
    } catch { /* silent */ }
  }, [accessToken, pushAlert]);

  // ── Register device for FCM push (dev-build only) ───────────────
  const registerDevice = useCallback(async () => {
    if (!accessToken || !user || !messaging) return;
    try {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      if (!enabled) return;

      const fcmToken = await messaging().getToken();
      if (!fcmToken) return;

      const deviceId = Device.osInternalBuildId || 'unknown_device';
      const platform = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : 'WEB';
      await mobileApi.registerDeviceToken({ deviceId, fcmToken, platform }, accessToken);
    } catch { /* silent */ }
  }, [accessToken, user]);

  // ── Request expo-notifications permission ────────────────────────
  useEffect(() => {
    if (isExpoGo || !Notifications) return;
    (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        await Notifications.requestPermissionsAsync();
      }
    })();
  }, []);

  // ── Socket.IO: listen for reminder:triggered (real-time) ────────
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleTriggered = (payload: any) => {
      pushAlert({
        id: `socket-${payload.reminderId}`,
        reminderId: payload.reminderId,
        content: payload.content,
        conversationId: payload.conversationId,
        creatorId: payload.creatorId,
        triggeredAt: new Date().toISOString(),
      });
      void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
    };

    const handleSyncNeeded = () => {
      void syncAllReminders();
      void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
    };

    socket.on('reminder:triggered', handleTriggered);
    socket.on('reminder:updated', handleSyncNeeded);
    socket.on('reminder:created', handleSyncNeeded);
    socket.on('reminder:deleted', handleSyncNeeded);

    return () => {
      socket.off('reminder:triggered', handleTriggered);
      socket.off('reminder:updated', handleSyncNeeded);
      socket.off('reminder:created', handleSyncNeeded);
      socket.off('reminder:deleted', handleSyncNeeded);
    };
  }, [socket, isConnected, pushAlert, syncAllReminders, queryClient]);

  // ── FCM foreground listener (dev-build only) ─────────────────────
  useEffect(() => {
    if (!messaging) return;
    try {
      const unsub = messaging().onMessage(async (msg: any) => {
        const { data } = msg;
        if (!data) return;

        if (data.type === 'REMINDER_TRIGGERED') {
          pushAlert({
            id: `fcm-${data.reminderId}`,
            reminderId: data.reminderId,
            content: data.content,
            conversationId: data.conversationId,
            creatorId: data.creatorId,
            triggeredAt: new Date().toISOString(),
          });
          void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
        } else if (data.type === 'REMINDER_UPDATED' || data.type === 'REMINDER_DELETED') {
          if (data.type === 'REMINDER_DELETED' && data.reminderId) {
            await cancelLocalReminder(data.reminderId);
          }
          void syncAllReminders();
          void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
        }
      });
      return unsub;
    } catch { /* silent */ }
  }, [pushAlert, queryClient, syncAllReminders, cancelLocalReminder]);

  // ── Expo notification received (foreground local notification) ───
  useEffect(() => {
    if (isExpoGo || !Notifications) return;

    const sub = Notifications.addNotificationReceivedListener((notification: any) => {
      const data = notification.request.content.data as any;
      if (data?.type === 'REMINDER_TRIGGERED') {
        pushAlert({
          id: `local-${data.reminderId}`,
          reminderId: data.reminderId,
          content: data.content || notification.request.content.body || '',
          conversationId: data.conversationId,
          triggeredAt: new Date().toISOString(),
        });
        void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
      }
    });
    return () => sub.remove();
  }, [pushAlert, queryClient]);

  // ── Init: sync + fetch missed + register device ──────────────────
  useEffect(() => {
    if (!accessToken) return;

    if (!didInitRef.current) {
      didInitRef.current = true;
      void syncAllReminders();
      void fetchMissedReminders();
      void registerDevice();
    }
  }, [accessToken, syncAllReminders, fetchMissedReminders, registerDevice]);

  // ── Re-sync on reconnect ─────────────────────────────────────────
  useEffect(() => {
    if (isConnected && accessToken && didInitRef.current) {
      void syncAllReminders();
      void fetchMissedReminders();
    }
  }, [isConnected, accessToken, syncAllReminders, fetchMissedReminders]);

  // ── Re-sync when app comes to foreground ─────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && accessToken) {
        void syncAllReminders();
        void fetchMissedReminders();
      }
    });
    return () => sub.remove();
  }, [accessToken, syncAllReminders, fetchMissedReminders]);

  return { alerts, dismissAlert, acknowledgeAlert };
}
