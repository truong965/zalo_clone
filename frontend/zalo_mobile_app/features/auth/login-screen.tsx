import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Keyboard, Platform, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoginForm } from '@/features/auth/components/login-form';
import { TwoFactorView } from '@/features/auth/components/two-factor-view';
import type { LoginFormData } from '@/features/auth/schemas/login-schema';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/providers/auth-provider';

export function LoginScreen() {
      const router = useRouter();
      const { login, twoFactorData, isAuthenticated } = useAuth();
      const { t } = useTranslation();
      const scheme = useColorScheme() ?? 'light';
      const insets = useSafeAreaInsets();

      const [isSubmitting, setIsSubmitting] = useState(false);
      const [keyboardVisible, setKeyboardVisible] = useState(false);

      useEffect(() => {
            const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
            const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
            const subShow = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
            const subHide = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
            return () => {
                  subShow.remove();
                  subHide.remove();
            };
      }, []);

      const submitLogin = useCallback(
            async (payload: LoginFormData) => {
                  setIsSubmitting(true);
                  try {
                        await login({ phoneNumber: payload.phoneNumber.trim(), password: payload.password });
                  } catch (error) {
                        const message = error instanceof Error ? error.message : t('auth.loginFailed');
                        Alert.alert(t('auth.loginFailed'), message);
                  } finally {
                        setIsSubmitting(false);
                  }
            },
            [login, t],
      );

      useEffect(() => {
            if (isAuthenticated && !twoFactorData) {
                  router.replace('/(tabs)');
            }
      }, [isAuthenticated, twoFactorData, router]);

      if (twoFactorData) {
            return <TwoFactorView />;
      }

      const content = (
            <View
                  style={{
                        flex: 1,
                        justifyContent: keyboardVisible ? 'flex-start' : 'center',
                        paddingHorizontal: 24,
                        paddingTop: keyboardVisible ? 8 : 0,
                        paddingBottom: insets.bottom + 16,
                  }}>
                  <View className={keyboardVisible ? 'mb-4 items-center' : 'mb-8 items-center'}>
                        <Text className="text-center text-[26px] font-bold tracking-tight text-foreground">
                              {t('auth.loginTitle')}
                        </Text>
                  </View>
                  <LoginForm isSubmitting={isSubmitting} onSubmit={submitLogin} />
            </View>
      );

      return (
            <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
                  <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                  {Platform.OS === 'ios' ? (
                        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
                              {content}
                        </KeyboardAvoidingView>
                  ) : (
                        content
                  )}
            </SafeAreaView>
      );
}
