import { DarkTheme as NavDarkTheme, DefaultTheme as NavDefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { MD3DarkTheme, MD3LightTheme, PaperProvider, adaptNavigationTheme } from 'react-native-paper';
import 'react-native-reanimated';
import '@/lib/i18n';
import '../global.css';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import { isExpoGo } from '@/constants/platform';

import { AuthProvider } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';
import { SocketProvider } from '@/providers/socket-provider';
import { getNotificationEnabledSync } from '@/lib/notification-settings';

// ── Notification handler ───────────────────────────────────────────
if (!isExpoGo) {
  try {
    const Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => {
        const isEnabled = getNotificationEnabledSync();
        return {
          shouldShowAlert: isEnabled,
          shouldPlaySound: isEnabled,
          shouldSetBadge: false,
          shouldShowBanner: isEnabled,
          shouldShowList: isEnabled,
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

// ── Firebase background handler (dev-build only) ──────────────────
try {
  const { setBackgroundMessageHandler } = require('@react-native-firebase/messaging');
  setBackgroundMessageHandler(async (_remoteMessage: any) => {
    // Wakes the app silently — actual processing in useReminderNotifications
  });
} catch {
  // Silent – Expo Go or not linked
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

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <SocketProvider>
            <AppContent colorScheme={colorScheme} />
          </SocketProvider>
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}

import { useReminderNotifications } from '@/features/chats/hooks/use-reminder-notifications';
import { ReminderAlertOverlay } from '@/features/chats/components/reminder/reminder-alert-overlay';
import { useConversationRealtime } from '@/features/chats/hooks/use-conversation-realtime';
import { IncomingCallModal } from '@/features/calls/components/incoming-call-modal';
import { useCallSocket } from '@/features/calls/hooks/use-call-socket';

function AppContent({ colorScheme }: { colorScheme: 'light' | 'dark' | null | undefined }) {
  const { alerts, dismissAlert, acknowledgeAlert } = useReminderNotifications();
  useConversationRealtime();
  if (!isExpoGo) {
    useCallSocket();
  }

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
      <Toast />
    </PaperProvider>
  );
}
