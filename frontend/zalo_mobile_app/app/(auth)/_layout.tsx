import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/providers/auth-provider';

export default function AuthLayout() {
      const { isAuthenticated, isLoading } = useAuth();
      const { t } = useTranslation();

      if (isLoading) {
            return null;
      }

      if (isAuthenticated) {
            return <Redirect href="/(tabs)" />;
      }

      return (
            <Stack>
                  <Stack.Screen name="login" options={{ title: t('auth.login') }} />
                  <Stack.Screen name="register" options={{ title: t('auth.registerTitle') }} />
                  <Stack.Screen name="forgot-password" options={{ title: t('auth.forgotPasswordTitle') }} />
            </Stack>
      );
}
