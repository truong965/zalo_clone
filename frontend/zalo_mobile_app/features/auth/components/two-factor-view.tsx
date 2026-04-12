import { OtpInput } from '@/components/ui/otp-input';
import { SocketEvents } from '@/constants/socket-events';
import { socketManager } from '@/lib/socket';
import { useAuth } from '@/providers/auth-provider';
import { mobileApi } from '@/services/api';
import type { TwoFactorMethod } from '@/types/auth';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
      ActivityIndicator,
      Alert,
      ScrollView,
      Text,
      TouchableOpacity,
      View
} from 'react-native';

interface TwoFactorViewProps {
      onSuccess?: (data: any) => void;
      onCancel?: () => void;
}

export function TwoFactorView({ onSuccess, onCancel }: TwoFactorViewProps) {
      const { t } = useTranslation();
      const { twoFactorData, verify2fa, clear2fa } = useAuth();
      
      const availableMethods = twoFactorData?.availableMethods || [];
      const hasPush = availableMethods.includes('PUSH');

      const [method, setMethod] = useState<TwoFactorMethod>(
            (twoFactorData?.autoTriggered && hasPush) 
                  ? 'PUSH' 
                  : (twoFactorData?.preferredMethod || availableMethods[0] || 'SMS')
      );
      
      const [pushStatus, setPushStatus] = useState<'IDLE' | 'WAITING' | 'REJECTED' | 'TIMEOUT' | 'VERIFYING'>(
            (twoFactorData?.autoTriggered && (twoFactorData?.preferredMethod === 'PUSH' || (!twoFactorData?.preferredMethod && hasPush))) 
                  ? 'WAITING' 
                  : 'IDLE'
      );

      if (!twoFactorData) {
            return (
                  <View className="flex-1 items-center justify-center p-6">
                        <ActivityIndicator size="large" color="#007AFF" />
                        <Text className="mt-4 text-gray-500">Đang chuẩn bị xác thực...</Text>
                  </View>
            );
      }

      const [code, setCode] = useState('');
      const [isLoading, setIsLoading] = useState(false);
      const [timer, setTimer] = useState(90); // 90s PUSH/OTP timeout
      const [resendCooldown, setResendCooldown] = useState(twoFactorData?.autoTriggered ? 45 : 0); // 45s anti-spam
      const timerRef = useRef<any>(null);
      const cooldownRef = useRef<any>(null);

      // Effect to sync state when twoFactorData changes from null to value
      useEffect(() => {
            if (twoFactorData) {
                  const methods = twoFactorData.availableMethods || [];
                  const hasPushNotify = methods.includes('PUSH');
                  
                  // Initialize method
                  const initialMethod = (twoFactorData.autoTriggered && hasPushNotify)
                        ? 'PUSH'
                        : (twoFactorData.preferredMethod || methods[0] || 'SMS'); // Default to SMS for safety in mobile
                  
                  setMethod(initialMethod);
                  
                  // Initialize push status
                  if (twoFactorData.autoTriggered && (twoFactorData.preferredMethod === 'PUSH' || (!twoFactorData.preferredMethod && hasPushNotify))) {
                        setPushStatus('WAITING');
                  } else {
                        setPushStatus('IDLE');
                  }

                  if (twoFactorData.autoTriggered) {
                        setResendCooldown(45);
                        startTimer();
                  }
            }
      }, [twoFactorData]);

      const startTimer = () => {
            if (timerRef.current) clearInterval(timerRef.current);
            setTimer(90); // Reset to 90s
            timerRef.current = setInterval(() => {
                  setTimer((prev) => {
                        if (prev <= 1) {
                              if (timerRef.current) clearInterval(timerRef.current);
                              setPushStatus('TIMEOUT');
                              return 0;
                        }
                        return prev - 1;
                  });
            }, 1000);
      };

      // Handle Cooldown Timer (1s ticks)
      useEffect(() => {
            if (resendCooldown > 0) {
                  cooldownRef.current = setInterval(() => {
                        setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
                  }, 1000);
            }
            return () => {
                  if (cooldownRef.current) clearInterval(cooldownRef.current);
            };
      }, [resendCooldown > 0]);

      // Initialize timer for auto-triggered events on mount
      useEffect(() => {
            if (twoFactorData?.autoTriggered) {
                  startTimer();
            }
            return () => {
                  if (timerRef.current) clearInterval(timerRef.current);
            };
      }, []);

      // Socket setup for PUSH
      useEffect(() => {
            if (method !== 'PUSH' || pushStatus !== 'WAITING' || !twoFactorData?.pendingToken) return;

            const socket = socketManager.connectUnauthenticated();

            socket.on(SocketEvents.TWO_FACTOR_APPROVED, async (data: any) => {
                  if (data.pendingToken === twoFactorData.pendingToken) {
                        if (timerRef.current) clearInterval(timerRef.current);
                        setPushStatus('VERIFYING');
                        setIsLoading(true);
                        try {
                              const result = await verify2fa({
                                    pendingToken: twoFactorData.pendingToken,
                                    method: 'PUSH',
                              });
                              if (onSuccess) {
                                    onSuccess(result);
                              }
                        } catch (error) {
                              Alert.alert(t('common.error'), error instanceof Error ? error.message : t('auth.verifyFailed'));
                              setPushStatus('TIMEOUT');
                        } finally {
                              setIsLoading(false);
                        }
                  }
            });

            socket.on(SocketEvents.TWO_FACTOR_REJECTED, () => {
                  if (timerRef.current) clearInterval(timerRef.current);
                  setPushStatus('REJECTED');
                  Alert.alert(t('auth.denied'), t('auth.pushRejected'));
            });

            return () => {
                  socketManager.disconnect();
                  if (method !== 'PUSH') {
                        setPushStatus('IDLE');
                        if (timerRef.current) clearInterval(timerRef.current);
                  }
            };
      }, [method, pushStatus, twoFactorData?.pendingToken, verify2fa, t]);

      const handleVerify = async () => {
            if (!twoFactorData?.pendingToken) return;
            if (!code && method !== 'PUSH') {
                  Alert.alert(t('common.error'), t('auth.codeRequired'));
                  return;
            }

            setIsLoading(true);
            try {
                  const result = await verify2fa({
                        pendingToken: twoFactorData.pendingToken,
                        code: method === 'PUSH' ? undefined : code,
                        method,
                        trustDevice: true,
                  });
                  if (onSuccess) {
                        onSuccess(result);
                  }
            } catch (error) {
                  Alert.alert(t('auth.verifyFailed'), error instanceof Error ? error.message : t('auth.verifyFailed'));
            } finally {
                  setIsLoading(false);
            }
      };

      const handlePushWait = async () => {
            setPushStatus('WAITING');
            setResendCooldown(45);
            startTimer();
            try {
                  await mobileApi.sendPushChallenge(twoFactorData!.pendingToken);
            } catch (error) {
                  Alert.alert(t('common.error'), error instanceof Error ? error.message : t('auth.verifyFailed'));
                  setPushStatus('IDLE');
            }
      };

      const triggerChallenge = async (selectedMethod: TwoFactorMethod) => {
            if (!twoFactorData?.pendingToken || resendCooldown > 0) return;
            setIsLoading(true);
            try {
                  if (selectedMethod === 'SMS') {
                        await mobileApi.sendSmsChallenge(twoFactorData.pendingToken);
                        Alert.alert(t('auth.otpSent'), t('auth.otpSentToPhone', { phone: twoFactorData.maskedPhone }));
                  } else if (selectedMethod === 'EMAIL') {
                        await mobileApi.sendEmailChallenge(twoFactorData.pendingToken);
                        Alert.alert(t('auth.otpSent'), t('auth.otpSentToEmail', { email: twoFactorData.maskedEmail }));
                  } else if (selectedMethod === 'PUSH') {
                        await handlePushWait();
                  } else if (selectedMethod === 'TOTP') {
                        await mobileApi.sendTotpChallenge(twoFactorData.pendingToken);
                  }
                  
                  if (selectedMethod !== 'PUSH') {
                        setMethod(selectedMethod);
                        setCode('');
                        setResendCooldown(45);
                        startTimer();
                  } else {
                        setMethod('PUSH');
                  }
            } catch (error) {
                  Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.error'));
            } finally {
                  setIsLoading(false);
            }
      };

      const formatTime = (seconds: number) => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
      };

      return (
            <ScrollView className="flex-1 bg-background" contentContainerStyle={{ flexGrow: 1 }}>
                  <View className="gap-6 p-6">
                        <TouchableOpacity 
                              onPress={onCancel || clear2fa} 
                              className="flex-row items-center gap-2 pt-4"
                              disabled={isLoading}
                        >
                              <Ionicons name="arrow-back" size={24} color={isLoading ? "#999" : "#007AFF"} />
                              <Text className={`text-lg font-semibold ${isLoading ? 'text-gray-400' : 'text-primary'}`}>{t('common.back')}</Text>
                        </TouchableOpacity>

                        <View>
                              <Text className="text-3xl font-bold text-foreground">
                                    {twoFactorData?.isReactivation ? 'Kích hoạt lại tài khoản' : t('auth.twoFactorTitle')}
                              </Text>
                               <Text className="mt-2 text-gray-700 text-base font-medium">
                                    {twoFactorData?.isForgotPassword && !twoFactorData?.twoFactorEnabled
                                          ? `Mã OTP đã được gửi về số điện thoại ${twoFactorData.maskedPhone}. Vui lòng nhập mã để khôi phục mật khẩu.`
                                          : twoFactorData?.isReactivation
                                                ? 'Vui lòng xác minh danh tính để tiếp tục kích hoạt lại tài khoản của bạn.'
                                                : t('auth.twoFactorSubtitle')}
                              </Text>
                        </View>

                        {/* Cooldown Alert */}
                        {resendCooldown > 0 && (
                              <View className="bg-orange-50 p-3 rounded-xl border border-orange-100">
                                    <Text className="text-orange-600 text-center font-medium">
                                          Bạn có thể thay đổi phương thức sau {resendCooldown}s
                                    </Text>
                              </View>
                        )}

                        {/* Method Selector */}
                        {twoFactorData?.twoFactorEnabled && (
                              <View className="flex-row flex-wrap gap-2">
                                    {availableMethods.map((m) => (
                                          <TouchableOpacity
                                                key={m}
                                                disabled={resendCooldown > 0 || isLoading}
                                                onPress={() => {
                                                      if (m === 'TOTP') {
                                                            triggerChallenge('TOTP');
                                                      } else {
                                                            triggerChallenge(m);
                                                      }
                                                }}
                                                className={`rounded-full px-4 py-2 border ${method === m ? 'bg-primary border-primary' : 'bg-secondary border-border'
                                                      } ${resendCooldown > 0 ? 'opacity-50' : ''}`}>
                                                <Text
                                                      className={`font-semibold ${method === m ? 'text-primary-foreground' : 'text-secondary-foreground'
                                                            }`}>
                                                      {m}
                                                </Text>
                                          </TouchableOpacity>
                                    ))}
                              </View>
                        )}

                        {/* Challenge Content */}
                        <View className="gap-4 rounded-2xl bg-secondary p-6 border border-border mt-2 shadow-sm">
                              {method === 'PUSH' ? (
                                    <View className="items-center py-6 gap-6">
                                          {['WAITING', 'VERIFYING'].includes(pushStatus) ? (
                                                <>
                                                      <View className="h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                                                            <ActivityIndicator size="large" color="#007AFF" />
                                                      </View>
                                                      <View className="gap-2">
                                                            <Text className="text-center text-xl font-bold text-foreground">
                                                                  {pushStatus === 'VERIFYING' ? 'Đang xác thực phê duyệt...' : t('auth.waitingForPush')}
                                                            </Text>
                                                            <Text className="text-center text-gray-700 font-medium px-4 leading-5">
                                                                  {t('auth.pushSentInstructions')}
                                                            </Text>
                                                      </View>
                                                </>
                                          ) : pushStatus === 'REJECTED' ? (
                                                <>
                                                      <View className="h-20 w-20 items-center justify-center rounded-full bg-red-100">
                                                            <Ionicons name="close-circle" size={48} color="#FF3B30" />
                                                      </View>
                                                      <View className="gap-1">
                                                            <Text className="text-center text-xl font-bold text-foreground">{t('auth.denied')}</Text>
                                                            <Text className="text-center text-gray-600 font-medium px-4">{t('auth.pushRejected')}</Text>
                                                      </View>
                                                </>
                                          ) : pushStatus === 'TIMEOUT' ? (
                                                <>
                                                      <View className="h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                                                            <Ionicons name="time" size={48} color="#8E8E93" />
                                                      </View>
                                                      <View className="gap-1">
                                                            <Text className="text-center text-xl font-bold text-foreground">Hết thời gian chờ</Text>
                                                            <Text className="text-center text-gray-600 font-medium px-4">Yêu cầu xác thực đã hết hạn. Vui lòng gửi lại yêu cầu.</Text>
                                                      </View>
                                                </>
                                          ) : (
                                                <>
                                                      <View className="h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                                                            <Ionicons name="notifications" size={40} color="#007AFF" />
                                                      </View>
                                                      <View className="gap-1">
                                                            <Text className="text-center text-xl font-bold text-foreground">Sẵn sàng gửi yêu cầu</Text>
                                                            <Text className="text-center text-gray-600 font-medium px-4">Nhấn nút bên dưới để gửi thông báo phê duyệt tới thiết bị của bạn.</Text>
                                                      </View>
                                                </>
                                          )}

                                          {pushStatus !== 'VERIFYING' && (
                                                <View className="w-full items-center gap-4">
                                                      <View className="bg-blue-50 px-4 py-2 rounded-lg items-center">
                                                            <Text className="text-blue-600 font-mono font-bold text-lg">
                                                                  {timer > 0 ? `Hiệu lực còn: ${formatTime(timer)}` : 'Hết thời gian chờ'}
                                                            </Text>
                                                      </View>
                                                      
                                                      <TouchableOpacity
                                                            onPress={handlePushWait}
                                                            disabled={resendCooldown > 0 || isLoading}
                                                            className={`w-full rounded-xl bg-primary py-4 items-center ${resendCooldown > 0 || isLoading ? 'opacity-50' : ''}`}>
                                                            <Text className="font-bold text-primary-foreground text-lg">
                                                                  {resendCooldown > 0 
                                                                        ? `Gửi lại yêu cầu (${resendCooldown}s)` 
                                                                        : (pushStatus === 'IDLE' ? 'Gửi yêu cầu phê duyệt' : 'Gửi lại yêu cầu phê duyệt')}
                                                            </Text>
                                                      </TouchableOpacity>
                                                </View>
                                          )}
                                    </View>
                              ) : (
                                    <View className="gap-5">
                                          <Text className="text-lg font-bold text-foreground text-center mb-2">
                                                {method === 'TOTP'
                                                      ? t('auth.enterTotp')
                                                      : method === 'SMS'
                                                            ? t('auth.enterSmsOtp')
                                                            : t('auth.enterEmailOtp')}
                                          </Text>
                                          <View className="mb-4">
                                                <OtpInput
                                                      length={6}
                                                      value={code}
                                                      onChange={setCode}
                                                      disabled={isLoading}
                                                />
                                          </View>
                                          <TouchableOpacity
                                                onPress={handleVerify}
                                                disabled={isLoading || code.length < 6}
                                                className={`items-center rounded-2xl bg-primary py-5 shadow-lg ${isLoading || code.length < 6 ? 'opacity-50' : ''
                                                      }`}>
                                                {isLoading ? (
                                                      <ActivityIndicator color="#ffffff" />
                                                ) : (
                                                      <Text className="text-lg font-bold text-primary-foreground">
                                                            {t('common.verify')}
                                                      </Text>
                                                )}
                                          </TouchableOpacity>

                                          {(method === 'SMS' || method === 'EMAIL') && (
                                                <TouchableOpacity
                                                      onPress={() => triggerChallenge(method)}
                                                      disabled={isLoading || resendCooldown > 0}
                                                      className="items-center py-2"
                                                >
                                                      <Text className={`font-bold text-base ${resendCooldown > 0 ? 'text-gray-400' : 'text-primary'}`}>
                                                            {resendCooldown > 0 ? `${t('auth.resendCode')} (${resendCooldown}s)` : t('auth.resendCode')}
                                                      </Text>
                                                </TouchableOpacity>
                                          )}
                                    </View>
                              )}
                        </View>
                  </View>
            </ScrollView>
      );
}
