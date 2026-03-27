import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { mobileApi } from '@/services/api';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export function ForgotPasswordScreen() {
      const router = useRouter();
      const { t } = useTranslation();

      const [currentStep, setCurrentStep] = useState(0);
      const [isLoading, setIsLoading] = useState(false);
      const [email, setEmail] = useState('');
      const [otp, setOtp] = useState('');
      const [newPassword, setNewPassword] = useState('');
      const [confirmPassword, setConfirmPassword] = useState('');

      const handleEmailSubmit = async () => {
            if (!email || !email.includes('@')) {
                  Alert.alert(t('common.error'), t('auth.validation.invalidEmail'));
                  return;
            }

            setIsLoading(true);
            try {
                  await mobileApi.forgotPassword({ email });
                  setCurrentStep(1);
                  Alert.alert(t('common.success'), t('auth.otpSent'));
            } catch (error: any) {
                  Alert.alert(t('common.error'), error.message || t('common.error'));
            } finally {
                  setIsLoading(false);
            }
      };

      const handleOtpSubmit = async () => {
            if (otp.length !== 6) {
                  Alert.alert(t('common.error'), t('auth.validation.invalidOtp'));
                  return;
            }

            setIsLoading(true);
            try {
                  await mobileApi.verifyOtp({ email, otp });
                  setCurrentStep(2);
                  Alert.alert(t('common.success'), t('auth.otpCorrect'));
            } catch (error: any) {
                  Alert.alert(t('common.error'), error.message || t('common.error'));
            } finally {
                  setIsLoading(false);
            }
      };

      const handleResetSubmit = async () => {
            if (newPassword.length < 6) {
                  Alert.alert(t('common.error'), t('auth.validation.passwordMin'));
                  return;
            }
            if (newPassword !== confirmPassword) {
                  Alert.alert(t('common.error'), t('auth.validation.passwordMismatch'));
                  return;
            }

            setIsLoading(true);
            try {
                  await mobileApi.resetPassword({ email, otp, newPassword });
                  Alert.alert(t('common.success'), t('auth.resetSuccess'));
                  router.replace('/login');
            } catch (error: any) {
                  Alert.alert(t('common.error'), error.message || t('common.error'));
            } finally {
                  setIsLoading(false);
            }
      };

      const renderStep = () => {
            switch (currentStep) {
                  case 0:
                        return (
                              <View className="gap-4">
                                    <View className="items-center mb-2">
                                          <MaterialCommunityIcons name="email-outline" size={64} color="hsl(217.2 91.2% 59.8%)" />
                                          <Text className="text-xl font-bold mt-2 text-foreground">{t('auth.forgotPasswordTitle')}</Text>
                                          <Text className="text-center text-muted mt-1 px-4">{t('auth.forgotPasswordSubtitle')}</Text>
                                    </View>
                                    <TextInput
                                          value={email}
                                          onChangeText={setEmail}
                                          placeholder={t('auth.email')}
                                          keyboardType="email-address"
                                          autoCapitalize="none"
                                          className="rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground"
                                    />
                                    <Pressable
                                          onPress={handleEmailSubmit}
                                          className="items-center rounded-xl bg-primary py-3 active:opacity-80"
                                          disabled={isLoading}>
                                          {isLoading ? <ActivityIndicator color="#ffffff" /> : <Text className="text-base font-bold text-primary-foreground">{t('auth.sendOtp')}</Text>}
                                    </Pressable>
                              </View>
                        );
                  case 1:
                        return (
                              <View className="gap-4">
                                    <View className="items-center mb-2">
                                          <MaterialCommunityIcons name="numeric-6-box-outline" size={64} color="hsl(217.2 91.2% 59.8%)" />
                                          <Text className="text-xl font-bold mt-2 text-foreground">{t('auth.otpCode')}</Text>
                                          <Text className="text-center text-muted mt-1">
                                                {t('auth.otpSent')} {"\n"}
                                                <Text className="font-bold text-foreground">{email}</Text>
                                          </Text>
                                    </View>
                                    <TextInput
                                          value={otp}
                                          onChangeText={setOtp}
                                          placeholder="000000"
                                          keyboardType="number-pad"
                                          maxLength={6}
                                          className="rounded-xl border border-border bg-background px-4 py-3 text-center text-2xl font-bold tracking-[10px] text-foreground"
                                    />
                                    <Pressable
                                          onPress={handleOtpSubmit}
                                          className="items-center rounded-xl bg-primary py-3 active:opacity-80"
                                          disabled={isLoading}>
                                          {isLoading ? <ActivityIndicator color="#ffffff" /> : <Text className="text-base font-bold text-primary-foreground">{t('auth.verifyOtp')}</Text>}
                                    </Pressable>
                                    <Pressable onPress={() => setCurrentStep(0)} className="items-center">
                                          <Text className="text-primary font-semibold">Thay đổi email</Text>
                                    </Pressable>
                              </View>
                        );
                  case 2:
                        return (
                              <View className="gap-4">
                                    <View className="items-center mb-2">
                                          <MaterialCommunityIcons name="lock-reset" size={64} color="hsl(217.2 91.2% 59.8%)" />
                                          <Text className="text-xl font-bold mt-2 text-foreground">{t('auth.newPassword')}</Text>
                                          <Text className="text-center text-muted mt-1">{t('auth.otpCorrect')}</Text>
                                    </View>
                                    <TextInput
                                          value={newPassword}
                                          onChangeText={setNewPassword}
                                          placeholder={t('auth.newPassword')}
                                          secureTextEntry
                                          className="rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground"
                                    />
                                    <TextInput
                                          value={confirmPassword}
                                          onChangeText={setConfirmPassword}
                                          placeholder={t('auth.confirmPassword')}
                                          secureTextEntry
                                          className="rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground"
                                    />
                                    <Pressable
                                          onPress={handleResetSubmit}
                                          className="items-center rounded-xl bg-primary py-3 active:opacity-80"
                                          disabled={isLoading}>
                                          {isLoading ? <ActivityIndicator color="#ffffff" /> : <Text className="text-base font-bold text-primary-foreground">{t('auth.resetPassword')}</Text>}
                                    </Pressable>
                              </View>
                        );
                  default:
                        return null;
            }
      };

      return (
            <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                  className="flex-1 justify-center bg-background p-6">
                  <View className="rounded-3xl bg-secondary p-6 shadow-sm border border-border">
                        <Pressable 
                            onPress={() => currentStep > 0 ? setCurrentStep(currentStep - 1) : router.back()}
                            className="absolute left-4 top-4 z-10 p-2"
                        >
                            <MaterialCommunityIcons name="arrow-left" size={24} color="hsl(240 3.8% 46.1%)" />
                        </Pressable>
                        
                        <View className="mt-8">
                            {renderStep()}
                        </View>

                        {currentStep === 0 && (
                              <Pressable onPress={() => router.back()} className="mt-6 items-center">
                                    <Text className="text-muted">{t('auth.backToLogin')}</Text>
                              </Pressable>
                        )}
                  </View>
            </KeyboardAvoidingView>
      );
}
