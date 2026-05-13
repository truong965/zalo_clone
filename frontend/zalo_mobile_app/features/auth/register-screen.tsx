import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ActivityIndicator, Keyboard, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RegisterForm } from '@/features/auth/components/register-form';
import type { RegisterFormData } from '@/features/auth/schemas/register-schema';
import { useAuth } from '@/providers/auth-provider';
import { OtpInput } from '@/components/ui/otp-input';
import { PHONE_REGEX } from '@/constants/validation';
import { useColorScheme } from '@/hooks/use-color-scheme';

const PLACEHOLDER = { light: '#52525b', dark: '#a1a1aa' } as const;

type RegisterStep = 'PHONE' | 'OTP' | 'PROFILE';

export function RegisterScreen() {
      const router = useRouter();
      const { register, requestRegisterOtp, verifyRegisterOtp } = useAuth();
      const { t } = useTranslation();
      const loginHref = '/login' as Href;
      const scheme = useColorScheme() ?? 'light';
      const placeholderColor = PLACEHOLDER[scheme];
      const insets = useSafeAreaInsets();

      const [step, setStep] = useState<RegisterStep>('PHONE');
      const [phoneNumber, setPhoneNumber] = useState('');
      const [otp, setOtp] = useState('');
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [countdown, setCountdown] = useState(0);
      const [keyboardVisible, setKeyboardVisible] = useState(false);
      const timerRef = useRef<any>(null);

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

      useEffect(() => {
            return () => {
                  if (timerRef.current) clearInterval(timerRef.current);
            };
      }, []);

      const startCountdown = () => {
            setCountdown(45);
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
                  setCountdown((prev) => {
                        if (prev <= 1) {
                              if (timerRef.current) clearInterval(timerRef.current);
                              return 0;
                        }
                        return prev - 1;
                  });
            }, 1000);
      };

      const handleRequestOtp = async () => {
            if (!phoneNumber || !PHONE_REGEX.test(phoneNumber)) {
                  Alert.alert(t('common.error'), t('auth.validation.invalidPhoneNumber'));
                  return;
            }

            setIsSubmitting(true);
            try {
                  await requestRegisterOtp({ phoneNumber });
                  setStep('OTP');
                  startCountdown();
            } catch (error: any) {
                  Alert.alert(t('common.error'), error?.message || t('auth.registerFailed'));
            } finally {
                  setIsSubmitting(false);
            }
      };

      const handleVerifyOtp = async () => {
            if (otp.length < 6) {
                  Alert.alert(t('common.error'), t('auth.validation.invalidOtp'));
                  return;
            }

            setIsSubmitting(true);
            try {
                  await verifyRegisterOtp({ phoneNumber, otp });
                  setStep('PROFILE');
            } catch (error: any) {
                  Alert.alert(t('common.error'), error?.message || t('auth.verifyFailed'));
            } finally {
                  setIsSubmitting(false);
            }
      };

      const submitRegister = async (payload: RegisterFormData) => {
            setIsSubmitting(true);
            try {
                  await register({
                        displayName: payload.displayName.trim(),
                        phoneNumber: phoneNumber.trim(),
                        password: payload.password,
                        gender: payload.gender,
                        dateOfBirth: payload.dateOfBirth instanceof Date ? payload.dateOfBirth.toISOString() : payload.dateOfBirth,
                  });
                  Alert.alert(t('common.success'), t('auth.registerSuccessMessage'));
                  router.replace(loginHref);
            } catch (error: any) {
                  Alert.alert(t('auth.registerFailed'), error?.message || t('auth.registerFailed'));
            } finally {
                  setIsSubmitting(false);
            }
      };

      const renderStep = () => {
            switch (step) {
                  case 'PHONE':
                        return (
                              <View className="gap-6 p-4">
                                    <View>
                                          <Text className="text-3xl font-bold text-foreground">{t('auth.registerTitle')}</Text>
                                          <Text className="mt-2 text-muted-foreground text-lg">Nhập số điện thoại để bắt đầu</Text>
                                    </View>
                                    <View className="gap-4">
                                          <TextInput
                                                value={phoneNumber}
                                                onChangeText={setPhoneNumber}
                                                placeholder={t('auth.phoneNumber')}
                                                placeholderTextColor={placeholderColor}
                                                keyboardType="phone-pad"
                                                className="h-16 rounded-2xl border border-border bg-background px-6 text-xl text-foreground"
                                                autoFocus
                                          />
                                          <TouchableOpacity
                                                onPress={handleRequestOtp}
                                                disabled={isSubmitting || !phoneNumber}
                                                className={`h-16 items-center justify-center rounded-2xl bg-primary shadow-lg ${
                                                      isSubmitting || !phoneNumber ? 'opacity-50' : ''
                                                }`}>
                                                {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="text-lg font-bold text-primary-foreground">Tiếp tục</Text>}
                                          </TouchableOpacity>
                                    </View>
                                    <TouchableOpacity onPress={() => router.replace(loginHref)}>
                                          <Text className="text-center font-semibold text-primary">{t('auth.hasAccountLogin')}</Text>
                                    </TouchableOpacity>
                              </View>
                        );
                  case 'OTP':
                        return (
                              <View className="gap-8 p-4">
                                    <TouchableOpacity onPress={() => setStep('PHONE')} className="flex-row items-center gap-2">
                                          <Ionicons name="arrow-back" size={24} color="#007AFF" />
                                          <Text className="text-lg font-semibold text-primary">Quay lại</Text>
                                    </TouchableOpacity>
                                    <View>
                                          <Text className="text-3xl font-bold text-foreground">Xác thực OTP</Text>
                                          <Text className="mt-2 text-muted-foreground text-lg">
                                                Mã OTP đã được gửi tới số <Text className="font-bold text-foreground">{phoneNumber}</Text>
                                          </Text>
                                    </View>
                                    <View className="gap-8 items-center">
                                          <OtpInput value={otp} onChange={setOtp} length={6} disabled={isSubmitting} />
                                          
                                          <View className="w-full gap-4">
                                                <TouchableOpacity
                                                      onPress={handleVerifyOtp}
                                                      disabled={isSubmitting || otp.length < 6}
                                                      className={`h-16 items-center justify-center rounded-2xl bg-primary shadow-lg ${
                                                            isSubmitting || otp.length < 6 ? 'opacity-50' : ''
                                                      }`}>
                                                      {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="text-lg font-bold text-primary-foreground">Xác thực</Text>}
                                                </TouchableOpacity>

                                                <View className="items-center">
                                                      {countdown > 0 ? (
                                                            <Text className="text-muted-foreground text-base">
                                                                  Gửi lại mã sau <Text className="font-bold text-primary">{countdown}s</Text>
                                                            </Text>
                                                      ) : (
                                                            <TouchableOpacity onPress={handleRequestOtp} disabled={isSubmitting}>
                                                                  <Text className="font-bold text-primary text-base">Gửi lại mã xác thực</Text>
                                                            </TouchableOpacity>
                                                      )}
                                                </View>
                                          </View>
                                    </View>
                              </View>
                        );
                  case 'PROFILE':
                        return (
                              <View className="p-4">
                                    <TouchableOpacity onPress={() => setStep('OTP')} className="mb-6 flex-row items-center gap-2">
                                          <Ionicons name="arrow-back" size={24} color="#007AFF" />
                                          <Text className="text-lg font-semibold text-primary">Thay đổi mã OTP</Text>
                                    </TouchableOpacity>
                                    <RegisterForm isSubmitting={isSubmitting} onSubmit={submitRegister} hidePhone />
                              </View>
                        );
            }
      };

      const content = (
            <View
                  style={{
                        flex: 1,
                        justifyContent: keyboardVisible ? 'flex-start' : 'center',
                        paddingTop: keyboardVisible ? 8 : 0,
                        paddingBottom: insets.bottom + 16,
                  }}>
                  {renderStep()}
            </View>
      );

      return Platform.OS === 'ios' ? (
            <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} className="bg-background" automaticOffset keyboardVerticalOffset={0}>
                  {content}
            </KeyboardAvoidingView>
      ) : (
            <View className="flex-1 bg-background">{content}</View>
      );
}
