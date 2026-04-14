import '@/lib/i18n';
import { DarkTheme as NavDarkTheme, DefaultTheme as NavDefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, PaperProvider, adaptNavigationTheme } from 'react-native-paper';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import '../global.css';

import { isExpoGo } from '@/constants/platform';

import { useTranslationStore } from '@/hooks/use-translation-store';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';
import { SocketProvider } from '@/providers/socket-provider';

// ── Notification handler ───────────────────────────────────────────
if (!isExpoGo) {
  try {
    const Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => {
        // App in FOREGROUND: suppress system tray alert to avoid annoyance.
        // usePushNotifications/useReminderNotifications will show in-app Toasts/Modals instead.
        return {
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      },
    });

    // Configure notification channel for Android
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
  } catch (e) {
    // Silent – probably not linked or missing
  }
}


// ── Themes ─────────────────────────────────────────────────────────
const { LightTheme: AdaptedLightTheme, DarkTheme: AdaptedDarkTheme } = adaptNavigationTheme({
  reactNavigationLight: NavDefaultTheme,
  reactNavigationDark: NavDarkTheme,
});

const PaperLightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...AdaptedLightTheme.colors,
    primary: 'hsl(217.2 91.2% 59.8%)',
  },
};

const PaperDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...AdaptedDarkTheme.colors,
    primary: 'hsl(217.2 91.2% 59.8%)',
  },
};

const NavThemeLight = {
  ...AdaptedLightTheme,
  colors: {
    ...AdaptedLightTheme.colors,
    primary: 'hsl(217.2 91.2% 59.8%)',
  },
};

const NavThemeDark = {
  ...AdaptedDarkTheme,
  colors: {
    ...AdaptedDarkTheme.colors,
    primary: 'hsl(217.2 91.2% 59.8%)',
  },
};

export const unstable_settings = {
  anchor: 'index',
};

export default function RootLayout() {
  const { colorScheme } = useNativeWindColorScheme();
  const hydrate = useTranslationStore((state) => state.hydrate);

  useEffect(() => {
    // Hydrate translation store from AsyncStorage on app start
    hydrate();
  }, [hydrate]);

  return (
    <SafeAreaProvider>
      <>
        <QueryProvider>
          <AuthProvider>
            <SocketProvider>
              <AppContent colorScheme={colorScheme} />
            </SocketProvider>
          </AuthProvider>
        </QueryProvider>
      </>
    </SafeAreaProvider>
  );
}

import { LoginApprovalModal } from '@/features/auth/components/login-approval-modal';
import { useLoginApprovalSocket } from '@/features/auth/hooks/use-login-approval-socket';
import { IncomingCallModal } from '@/features/calls/components/incoming-call-modal';
import { useCallSocket } from '@/features/calls/hooks/use-call-socket';
import { ReminderAlertOverlay } from '@/features/chats/components/reminder/reminder-alert-overlay';
import { useConversationRealtime } from '@/features/chats/hooks/use-conversation-realtime';
import { useReminderNotifications } from '@/features/chats/hooks/use-reminder-notifications';
import { useContactSyncListener } from '@/features/contacts/hooks/use-contact-sync-listener';
import { usePushNotifications } from '@/hooks/use-push-notifications';

import { ContactSyncModal } from '@/features/contacts/components/contact-sync-modal';

function AppContent({ colorScheme }: { colorScheme: 'light' | 'dark' | null | undefined }) {
  const { alerts, dismissAlert, acknowledgeAlert } = useReminderNotifications();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useConversationRealtime();
  usePushNotifications();
  useLoginApprovalSocket();
  useContactSyncListener();

  if (!isExpoGo) {
    useCallSocket();
  }

  // FCM foreground message handler.
  // onMessage fires when the app is in the FOREGROUND and receives any FCM message.
  // For MOST types (messages, social events) — socket has already delivered them
  // in realtime, so we suppress the OS notification to avoid duplicates.
  // Exception: REMINDER_TRIGGERED must always show (like an alarm) even in foreground.
  useEffect(() => {
    if (isExpoGo) return;

    let unsubscribe: (() => void) | undefined;
    try {
      const messaging = require('@react-native-firebase/messaging').default;
      const Notifications = require('expo-notifications');

      unsubscribe = messaging().onMessage(async (remoteMessage: any) => {
        const msgType = remoteMessage?.data?.type;
        const msgData = remoteMessage?.data || {};

        if (msgType === 'REMINDER_TRIGGERED') {
          // Reminder is time-critical — show OS notification even in foreground.
          // (setNotificationHandler returns shouldShowAlert: false for expo-notifications,
          // but we bypass it by scheduling directly here.)
          console.log('[FCM] Foreground REMINDER — scheduling OS notification');
          await Notifications.scheduleNotificationAsync({
            content: {
              title: msgData.title || '🔔 Nhắc hẹn',
              body: msgData.body || msgData.content || 'Bạn có nhắc hẹn',
              data: { ...msgData },
              sound: true,
              priority: Notifications.AndroidNotificationPriority.MAX,
            },
            trigger: { channelId: 'default' } as any,
          }).catch((e: any) =>
            console.warn('[FCM] Foreground reminder schedule failed:', e),
          );
          return;
        }

        // All other types: socket already delivered in realtime — suppress.
        console.log('[FCM] Foreground message suppressed (type:', msgType, ')');
      });
    } catch (e) {
      // Silently ignore if firebase module not linked (e.g. during testing)
    }

    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup && segments[0] !== undefined) {
      // Not authenticated and not in auth group, redirect to login
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // Authenticated but in auth group, redirect to home
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments]);

  return (
    <PaperProvider theme={colorScheme === 'dark' ? PaperDarkTheme : PaperLightTheme}>
      <ThemeProvider value={colorScheme === 'dark' ? NavThemeDark : NavThemeLight}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat" />
          <Stack.Screen name="qr-scanner" />
          {/* profile is managed via its own directory routes like profile/index, profile/settings etc */}
        </Stack>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
      <ReminderAlertOverlay
        alerts={alerts}
        onDismiss={dismissAlert}
        onAcknowledge={acknowledgeAlert}
      />
      {!isExpoGo && <IncomingCallModal />}
      <LoginApprovalModal />
      <ContactSyncModal />
      <Toast />
    </PaperProvider>
  );
}

