import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { RegisterForm } from '@/features/auth/components/register-form';
import type { RegisterFormData } from '@/features/auth/schemas/register-schema';
import { useAuth } from '@/providers/auth-provider';

export function RegisterScreen() {
      const router = useRouter();
      const { register } = useAuth();
      const { t } = useTranslation();
      const loginHref = '/login' as Href;

      const [isSubmitting, setIsSubmitting] = useState(false);

      const submitRegister = async (payload: RegisterFormData) => {
            setIsSubmitting(true);
            try {
                  await register({
                        displayName: payload.displayName.trim(),
                        phoneNumber: payload.phoneNumber.trim(),
                        password: payload.password,
                        gender: payload.gender,
                        dateOfBirth: payload.dateOfBirth instanceof Date ? payload.dateOfBirth.toISOString() : payload.dateOfBirth,
                  });
                  Alert.alert(t('common.success'), t('auth.registerSuccessMessage'));
                  router.replace(loginHref);
            } catch (error) {
                  const message = error instanceof Error ? error.message : t('auth.registerFailed');
                  Alert.alert(t('auth.registerFailed'), message);
            } finally {
                  setIsSubmitting(false);
            }
      };

      return (
            <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                  className="flex-1 bg-background">
                  <ScrollView contentContainerClassName="flex-grow justify-center p-4">
                        <View className="rounded-2xl bg-background">
                              <RegisterForm isSubmitting={isSubmitting} onSubmit={submitRegister} />
                        </View>
                  </ScrollView>
            </KeyboardAvoidingView>
      );
}
