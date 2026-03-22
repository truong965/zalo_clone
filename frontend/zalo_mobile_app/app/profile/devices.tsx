import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View, ScrollView } from 'react-native';
import { Appbar, useTheme } from 'react-native-paper';

import { useAuth } from '@/providers/auth-provider';
import { ApiRequestError, mobileApi } from '@/services/api';
import type { DeviceSession } from '@/types/auth';

export default function DevicesScreen() {
  const router = useRouter();
  const { accessToken, logout } = useAuth();
  const theme = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [devices, setDevices] = useState<DeviceSession[]>([]);

  const handleSessionRevoked = useCallback(async () => {
    await logout();
    router.replace('/login');
  }, [logout, router]);

  const loadDeviceSessions = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
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
      setIsLoading(false);
    }
  }, [accessToken, handleSessionRevoked]);

  useFocusEffect(
    useCallback(() => {
      loadDeviceSessions();
    }, [loadDeviceSessions])
  );

  const onForceLogoutDevice = async (session: DeviceSession) => {
    if (!accessToken) return;

    Alert.alert('Đăng xuất thiết bị', `Bạn có chắc chắn muốn đăng xuất khỏi ${session.deviceName}?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await mobileApi.revokeSession(session.deviceId, accessToken);
              await loadDeviceSessions();
              Alert.alert('Thành công', 'Đã đăng xuất thiết bị');
            } catch (error) {
              if (error instanceof ApiRequestError && error.status === 401) {
                await handleSessionRevoked();
                return;
              }
              Alert.alert('Lỗi', 'Không thể đăng xuất thiết bị');
            }
          })();
        },
      },
    ]);
  };

  const AnyFlashList = FlashList as any;

  return (
    <View className="flex-1 bg-background">
      <Appbar.Header style={{ backgroundColor: '#1E88E5' }}>
        <Appbar.BackAction color="white" onPress={() => router.back()} />
        <Appbar.Content title="Quản lý thiết bị" titleStyle={{ color: 'white' }} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="p-4">
          <Text className="text-muted-foreground mb-4">
            Dưới đây là danh sách các thiết bị đã đăng nhập vào tài khoản của bạn.
          </Text>

          {isLoading ? (
            <ActivityIndicator />
          ) : (
            <View className="rounded-2xl border border-border bg-secondary p-4">
              <AnyFlashList
                data={devices}
                keyExtractor={(item: DeviceSession) => item.deviceId}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View className="h-px bg-border my-2" />}
                ListEmptyComponent={<Text className="text-center text-muted-foreground py-4">Không có thiết bị nào</Text>}
                renderItem={({ item }: { item: DeviceSession }) => (
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="font-bold text-foreground">{item.deviceName}</Text>
                      <Text className="text-xs text-muted-foreground">
                        {item.platform} • {item.ipAddress}
                      </Text>
                      <Text className={`text-xs ${item.isOnline ? 'text-green-500' : 'text-muted-foreground'}`}>
                        {item.isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}
                      </Text>
                    </View>
                    <Pressable
                      className="rounded-lg border border-error px-3 py-1.5"
                      onPress={() => onForceLogoutDevice(item)}>
                      <Text className="text-error font-bold text-xs">Đăng xuất</Text>
                    </Pressable>
                  </View>
                )}
                estimatedItemSize={80}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
