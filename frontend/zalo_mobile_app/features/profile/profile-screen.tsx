import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import type { Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { useAuth } from '@/providers/auth-provider';
import { ApiRequestError, mobileApi } from '@/services/api';
import type { DeviceSession } from '@/types/auth';

export function ProfileScreen() {
      const router = useRouter();
      const { user, accessToken, logout, refreshProfile } = useAuth();
      const { t } = useTranslation();
      const loginHref = '/login' as Href;
      const qrScannerHref = '/qr-scanner' as Href;
      const [isRefreshing, setIsRefreshing] = useState(false);
      const [isLoadingDevices, setIsLoadingDevices] = useState(false);
      const [devices, setDevices] = useState<DeviceSession[]>([]);

      const handleSessionRevoked = useCallback(async () => {
            await logout();
            router.replace(loginHref);
      }, [loginHref, logout, router]);

      const loadDeviceSessions = useCallback(async () => {
            if (!accessToken) {
                  setDevices([]);
                  return;
            }

            setIsLoadingDevices(true);
            try {
                  const sessions = await mobileApi.getSessions(accessToken);
                  setDevices(sessions);
            } catch (error) {
                  if (error instanceof ApiRequestError && error.status === 401) {
                        await handleSessionRevoked();
                        return;
                  }

                  setDevices([]);
            } finally {
                  setIsLoadingDevices(false);
            }
      }, [accessToken, handleSessionRevoked]);

      useFocusEffect(
            useCallback(() => {
                  setIsRefreshing(true);

                  const run = async () => {
                        try {
                              await Promise.all([refreshProfile(), loadDeviceSessions()]);
                        } catch (error) {
                              if (error instanceof ApiRequestError && error.status === 401) {
                                    await handleSessionRevoked();
                                    return;
                              }

                              throw error;
                        } finally {
                              setIsRefreshing(false);
                        }
                  };

                  void run();
            }, [handleSessionRevoked, loadDeviceSessions, refreshProfile]),
      );

      const onLogout = async () => {
            await logout();
            router.replace(loginHref);
      };

      const onForceLogoutDevice = async (session: DeviceSession) => {
            if (!accessToken) {
                  return;
            }

            Alert.alert(t('profile.revokeTitle'), t('profile.revokeConfirm', { deviceName: session.deviceName }), [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                        text: t('profile.revoke'),
                        style: 'destructive',
                        onPress: () => {
                              void (async () => {
                                    try {
                                          await mobileApi.revokeSession(session.deviceId, accessToken);
                                          await loadDeviceSessions();
                                          Alert.alert(t('common.success'), t('profile.revokeSuccess'));
                                    } catch (error) {
                                          if (error instanceof ApiRequestError && error.status === 401) {
                                                await handleSessionRevoked();
                                                return;
                                          }

                                          const message = error instanceof Error ? error.message : t('profile.revokeFailed');
                                          Alert.alert(t('common.error'), message);
                                    }
                              })();
                        },
                  },
            ]);
      };

      return (
            <ScrollView contentContainerClassName="flex-grow gap-3 bg-background p-4">
                  {isRefreshing ? (
                        <ActivityIndicator />
                  ) : (
                        <View className="gap-1.5 rounded-2xl border border-border bg-secondary p-3.5">
                              <Text className="text-lg font-bold text-foreground">{user?.displayName ?? t('profile.defaultUser')}</Text>
                              <Text className="text-muted">
                                    {t('profile.phone')}: {user?.phoneNumber ?? t('calls.na')}
                              </Text>
                              <Text className="text-muted">
                                    {t('profile.role')}: {user?.role ?? t('profile.defaultRole')}
                              </Text>
                        </View>
                  )}

                  <Pressable className="items-center rounded-xl bg-primary py-3" onPress={() => router.push(qrScannerHref)}>
                        <Text className="font-bold text-primary-foreground">{t('profile.scanQr')}</Text>
                  </Pressable>

                  <Pressable className="items-center rounded-xl border border-danger bg-secondary py-3" onPress={onLogout}>
                        <Text className="font-bold text-danger">{t('profile.logoutMobile')}</Text>
                  </Pressable>

                  <View className="mt-1 rounded-2xl border border-border bg-secondary p-3.5">
                        <Text className="mb-2 text-[17px] font-bold text-foreground">{t('profile.deviceManagement')}</Text>

                        {isLoadingDevices ? (
                              <ActivityIndicator />
                        ) : (
                              <FlashList
                                    data={devices}
                                    keyExtractor={(item) => item.deviceId}
                                    scrollEnabled={false}
                                    ItemSeparatorComponent={() => <View className="h-px bg-border" />}
                                    ListEmptyComponent={<Text className="text-muted">{t('profile.noSession')}</Text>}
                                    renderItem={({ item }) => (
                                          <View className="flex-row items-center justify-between gap-3 py-2">
                                                <View className="flex-1 gap-0.5">
                                                      <Text className="font-bold text-foreground">{item.deviceName}</Text>
                                                      <Text className="text-muted">
                                                            {item.platform} | {item.loginMethod} | {item.ipAddress}
                                                      </Text>
                                                      <Text className="text-muted">
                                                            {item.isOnline ? t('profile.online') : t('profile.offline')}
                                                      </Text>
                                                </View>
                                                <Pressable
                                                      className="rounded-lg border border-danger px-2.5 py-1.5"
                                                      onPress={() => void onForceLogoutDevice(item)}>
                                                      <Text className="font-bold text-danger">{t('profile.revoke')}</Text>
                                                </Pressable>
                                          </View>
                                    )}
                              />
                        )}
                  </View>
            </ScrollView>
      );
}
