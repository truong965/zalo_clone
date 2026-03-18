import { DarkTheme as NavDarkTheme, DefaultTheme as NavDefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MD3DarkTheme, MD3LightTheme, PaperProvider, adaptNavigationTheme } from 'react-native-paper';
import 'react-native-reanimated';
import '@/lib/i18n';
import '../global.css';

import { AuthProvider } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';
import { SocketProvider } from '@/providers/socket-provider';

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
            <PaperProvider theme={colorScheme === 'dark' ? PaperDarkTheme : PaperLightTheme}>
              <ThemeProvider value={colorScheme === 'dark' ? NavThemeDark : NavThemeLight}>
                <View className={`flex-1 ${colorScheme === 'dark' ? 'dark' : ''}`}>
                  <Stack>
                    <Stack.Screen name="index" options={{ headerShown: false }} />
                    <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen name="chat" options={{ headerShown: false }} />
                    <Stack.Screen name="qr-scanner" options={{ title: 'QR Scanner', headerShown: true }} />
                  </Stack>
                  <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
                </View>
              </ThemeProvider>
            </PaperProvider>
          </SocketProvider>
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
