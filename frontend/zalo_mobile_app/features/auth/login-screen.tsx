import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';

import { LoginForm } from '@/features/auth/components/login-form';
import type { LoginFormData } from '@/features/auth/schemas/login-schema';
import { useAuth } from '@/providers/auth-provider';

export function LoginScreen() {
      const router = useRouter();
      const { login } = useAuth();
      const { t } = useTranslation();

      const [isSubmitting, setIsSubmitting] = useState(false);

      const submitLogin = async (payload: LoginFormData) => {
            setIsSubmitting(true);
            try {
                  await login({ phoneNumber: payload.phoneNumber.trim(), password: payload.password });
                  router.replace('/(tabs)');
            } catch (error) {
                  const message = error instanceof Error ? error.message : t('auth.loginFailed');
                  Alert.alert(t('auth.loginFailed'), message);
            } finally {
                  setIsSubmitting(false);
            }
      };

      return (
            <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                  className="flex-1 justify-center bg-background p-4">
                  <View className="rounded-2xl bg-background">
                        <LoginForm isSubmitting={isSubmitting} onSubmit={submitLogin} />
                  </View>
            </KeyboardAvoidingView>
      );
}
