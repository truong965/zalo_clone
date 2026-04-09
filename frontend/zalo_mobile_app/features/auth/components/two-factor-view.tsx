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
      const [method, setMethod] = useState<TwoFactorMethod>(
            twoFactorData?.autoTriggered ? 'PUSH' : (twoFactorData?.preferredMethod || 'TOTP')
      );
      const [code, setCode] = useState('');
      const [isLoading, setIsLoading] = useState(false);
      const [timer, setTimer] = useState(90); // 90s PUSH/OTP timeout
      const [resendCooldown, setResendCooldown] = useState(twoFactorData?.autoTriggered ? 45 : 0); // 45s anti-spam
      const [isSocketConnected, setIsSocketConnected] = useState(false);
      const timerRef = useRef<any>(null);
      const cooldownRef = useRef<any>(null);

      // Cooldown ticker
      useEffect(() => {
            if (resendCooldown > 0) {
                  cooldownRef.current = setInterval(() => {
                        setResendCooldown((prev) => {
                              if (prev <= 1) {
                                    if (cooldownRef.current) clearInterval(cooldownRef.current);
                                    return 0;
                              }
                              return prev - 1;
                        });
                  }, 1000);
            }
            return () => {
                  if (cooldownRef.current) clearInterval(cooldownRef.current);
            };
      }, [resendCooldown]);

      // Socket setup for PUSH
      useEffect(() => {
            if (method !== 'PUSH' || !twoFactorData?.pendingToken) return;

            const socket = socketManager.connectUnauthenticated();

            socket.on(SocketEvents.CONNECT, () => {
                  setIsSocketConnected(true);
                  socket.emit(SocketEvents.TWO_FACTOR_SUBSCRIBE, {
                        pendingToken: twoFactorData.pendingToken,
                  });
            });

            socket.on(SocketEvents.TWO_FACTOR_APPROVED, async (data: any) => {
                  if (data.pendingToken === twoFactorData.pendingToken) {
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
                        } finally {
                              setIsLoading(false);
                        }
                  }
            });

            socket.on(SocketEvents.TWO_FACTOR_REJECTED, () => {
                  Alert.alert(t('auth.denied'), t('auth.pushRejected'));
                  // Don't auto-switch if cooldown is active, let the user wait
                  if (resendCooldown === 0) {
                        setMethod('TOTP');
                  }
            });

            return () => {
                  socketManager.disconnect();
            };
      }, [method, twoFactorData?.pendingToken, verify2fa, t, resendCooldown]);

      // Timer for PUSH
      useEffect(() => {
            if (method === 'PUSH' && timer > 0) {
                  timerRef.current = setInterval(() => {
                        setTimer((prev) => prev - 1);
                  }, 1000);
            } else if (timer === 0) {
                  if (timerRef.current) clearInterval(timerRef.current);
            }

            return () => {
                  if (timerRef.current) clearInterval(timerRef.current);
            };
      }, [method, timer]);

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
                        await mobileApi.sendPushChallenge(twoFactorData.pendingToken);
                        setTimer(90);
                  } else if (selectedMethod === 'TOTP') {
                        await mobileApi.sendTotpChallenge(twoFactorData.pendingToken);
                  }
                  setMethod(selectedMethod);
                  setCode('');
                  setResendCooldown(45); // Trigger 45s cooldown
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

      const availableMethods = twoFactorData?.availableMethods || [];

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
                                    {twoFactorData?.isReactivation
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

                        {/* Challenge Content */}
                        <View className="gap-4 rounded-2xl bg-secondary p-6 border border-border mt-2 shadow-sm">
                              {method === 'PUSH' ? (
                                    <View className="items-center py-6 gap-6">
                                          <View className="h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                                                <Ionicons name="notifications" size={40} color="#007AFF" />
                                          </View>
                                          <View className="gap-2">
                                                <Text className="text-center text-xl font-bold text-foreground">
                                                      {twoFactorData?.autoTriggered ? 'Xác nhận đăng nhập trên máy tính' : t('auth.waitingForPush')}
                                                </Text>
                                                <Text className="text-center text-gray-700 font-medium px-4 leading-5">
                                                      {twoFactorData?.autoTriggered
                                                            ? 'Chúng tôi đã gửi yêu cầu phê duyệt tới thiết bị này. Vui lòng kiểm tra thông báo hoặc chọn phương thức khác bên dưới.'
                                                            : t('auth.pushSentInstructions')}
                                                </Text>
                                          </View>
                                          <View className="items-center gap-1">
                                                <Text className="text-3xl font-mono font-bold text-primary">
                                                      {formatTime(timer)}
                                                </Text>
                                                <Text className="text-xs text-muted">
                                                      {isSocketConnected ? t('auth.socketOnline') : t('auth.socketConnecting')}
                                                </Text>
                                          </View>
                                          <TouchableOpacity
                                                onPress={() => triggerChallenge('PUSH')}
                                                disabled={resendCooldown > 0 || isLoading}
                                                className={`mt-2 rounded-xl bg-primary px-8 py-4 ${resendCooldown > 0 ? 'opacity-50' : ''}`}>
                                                <Text className="font-bold text-primary-foreground text-lg">
                                                      {resendCooldown > 0 ? `${t('auth.resendPush')} (${resendCooldown}s)` : t('auth.resendPush')}
                                                </Text>
                                          </TouchableOpacity>
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
