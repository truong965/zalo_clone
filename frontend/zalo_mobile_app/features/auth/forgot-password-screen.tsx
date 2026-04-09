import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View, ActivityIndicator, ScrollView } from 'react-native';
import { mobileApi } from '@/services/api';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TwoFactorView } from './components/two-factor-view';
import { useAuth } from '@/providers/auth-provider';
import type { TwoFactorRequiredResponse } from '@/types/auth';

export function ForgotPasswordScreen() {
      const router = useRouter();
      const { t } = useTranslation();
      const { setTwoFactorData, clear2fa } = useAuth() as any; // Access internal setters if needed, or just manage local state

      const [currentStep, setCurrentStep] = useState(0);
      const [isLoading, setIsLoading] = useState(false);
      const [identifier, setIdentifier] = useState('');
      const [localTwoFactorData, setLocalTwoFactorData] = useState<TwoFactorRequiredResponse | null>(null);
      const [resetToken, setResetToken] = useState('');
      const [newPassword, setNewPassword] = useState('');
      const [confirmPassword, setConfirmPassword] = useState('');

      const handleIdentifierSubmit = async () => {
            if (!identifier) {
                  Alert.alert(t('common.error'), t('auth.validation.required'));
                  return;
            }

            setIsLoading(true);
            try {
                  const result = await mobileApi.forgotPassword({ identifier });
                  
                  if (result && 'status' in result && result.status === '2FA_REQUIRED') {
                        setLocalTwoFactorData(result);
                        // We also need to set it in AuthProvider because TwoFactorView reads from there
                        if (setTwoFactorData) {
                              setTwoFactorData(result);
                        }
                        setCurrentStep(1);
                  } else {
                        Alert.alert(t('common.error'), 'Hệ thống không yêu cầu xác thực cho tài khoản này.');
                  }
            } catch (error: any) {
                  Alert.alert(t('common.error'), error.message || t('common.error'));
            } finally {
                  setIsLoading(false);
            }
      };

      const handleTwoFactorSuccess = (result: any) => {
            if (result.status === 'RESET_TOKEN_ISSUED' && result.resetToken) {
                  setResetToken(result.resetToken);
                  setCurrentStep(2);
                  clear2fa(); // Cleanup global 2FA state
            } else {
                  Alert.alert(t('common.error'), 'Xác thực không hợp lệ');
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
                  await mobileApi.resetPassword({ resetToken, newPassword });
                  Alert.alert(t('common.success'), t('auth.resetSuccess'));
                  setCurrentStep(3);
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
                                          <MaterialCommunityIcons name="account-search-outline" size={64} color="hsl(217.2 91.2% 59.8%)" />
                                          <Text className="text-xl font-bold mt-2 text-foreground">{t('auth.forgotPasswordTitle')}</Text>
                                          <Text className="text-center text-muted mt-1 px-4">Nhập số điện thoại hoặc email để khôi phục mật khẩu</Text>
                                    </View>
                                    <TextInput
                                          value={identifier}
                                          onChangeText={setIdentifier}
                                          placeholder="Số điện thoại hoặc Email"
                                          autoCapitalize="none"
                                          className="rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground"
                                    />
                                    <Pressable
                                          onPress={handleIdentifierSubmit}
                                          className="items-center rounded-xl bg-primary py-3 active:opacity-80"
                                          disabled={isLoading}>
                                          {isLoading ? <ActivityIndicator color="#ffffff" /> : <Text className="text-base font-bold text-primary-foreground">{t('common.continue')}</Text>}
                                    </Pressable>
                              </View>
                        );
                  case 1:
                        return (
                              <View className="min-h-[400px]">
                                    <TwoFactorView 
                                          onSuccess={handleTwoFactorSuccess}
                                          onCancel={() => setCurrentStep(0)}
                                    />
                              </View>
                        );
                  case 2:
                        return (
                              <View className="gap-4">
                                    <View className="items-center mb-2">
                                          <MaterialCommunityIcons name="lock-reset" size={64} color="hsl(217.2 91.2% 59.8%)" />
                                          <Text className="text-xl font-bold mt-2 text-foreground">{t('auth.newPassword')}</Text>
                                          <Text className="text-center text-muted mt-1">Xác thực thành công. Vui lòng đặt mật khẩu mới.</Text>
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
                  case 3:
                        return (
                              <View className="items-center gap-6 py-6">
                                    <MaterialCommunityIcons name="check-circle-outline" size={80} color="#10b981" />
                                    <View className="items-center gap-2">
                                          <Text className="text-2xl font-bold text-foreground">Thành công!</Text>
                                          <Text className="text-center text-muted px-6">Mật khẩu của bạn đã được thay đổi. Bạn có thể đăng nhập ngay bây giờ.</Text>
                                    </View>
                                    <Pressable
                                          onPress={() => router.replace('/login')}
                                          className="w-full items-center rounded-xl bg-primary py-4 active:opacity-80">
                                          <Text className="text-lg font-bold text-primary-foreground">Quay lại đăng nhập</Text>
                                    </Pressable>
                              </View>
                        )
                  default:
                        return null;
            }
      };

      return (
            <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                  className="flex-1 bg-background">
                  <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
                        <View className="rounded-3xl bg-secondary p-6 shadow-sm border border-border">
                              <Pressable 
                                  onPress={() => currentStep > 0 && currentStep < 3 ? setCurrentStep(currentStep - 1) : router.back()}
                                  className="absolute left-4 top-4 z-10 p-2"
                              >
                                  <MaterialCommunityIcons name="arrow-left" size={24} color="hsl(240 3.8% 46.1%)" />
                              </Pressable>
                              
                              <View className={currentStep === 1 ? "" : "mt-8"}>
                                  {renderStep()}
                              </View>

                              {currentStep === 0 && (
                                    <Pressable onPress={() => router.back()} className="mt-6 items-center">
                                          <Text className="text-muted">{t('auth.backToLogin')}</Text>
                                    </Pressable>
                              )}
                        </View>
                  </ScrollView>
            </KeyboardAvoidingView>
      );
}
