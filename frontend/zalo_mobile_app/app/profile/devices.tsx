import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View, ScrollView, Platform } from 'react-native';
import { Appbar, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';

import { useAuth } from '@/providers/auth-provider';
import { ApiRequestError, mobileApi } from '@/services/api';
import type { DeviceSession } from '@/types/auth';

dayjs.extend(relativeTime);
dayjs.locale('vi');

// Manual base64 decode fallback for environments without atob
const base64Decode = (str: string): string => {
  try {
    if (typeof atob === 'function') return atob(str);
  } catch (e) {
    // atob might fail or be missing
  }

  // Fallback implementation
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  str = String(str).replace(/=+$/, '');
  for (
    let bc = 0, bs = 0, buffer, idx = 0;
    (buffer = str.charAt(idx++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(buffer);
  }
  return output;
};

// Helper to decode deviceId from JWT
const getDeviceIdFromToken = (token: string | null): string | null => {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = base64Decode(base64);
    const data = JSON.parse(decoded);
    return data.deviceId;
  } catch (e) {
    console.warn('[DevicesScreen] Failed to decode token:', e);
    return null;
  }
};

const getPlatformIcon = (platform: string): keyof typeof MaterialCommunityIcons.glyphMap => {
  const p = platform.toUpperCase();
  if (p.includes('IOS') || p.includes('IPHONE')) return 'apple';
  if (p.includes('ANDROID')) return 'android';
  if (p.includes('WINDOWS')) return 'microsoft-windows';
  if (p.includes('MACOS')) return 'apple-ios';
  if (p.includes('WEB')) return 'web';
  return 'devices';
};

export default function DevicesScreen() {
  const router = useRouter();
  const { accessToken, logout } = useAuth();
  const theme = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [devices, setDevices] = useState<DeviceSession[]>([]);

  const currentDeviceId = useMemo(() => getDeviceIdFromToken(accessToken), [accessToken]);

  const handleSessionRevoked = useCallback(async () => {
    await logout();
    router.replace('/login');
  }, [logout, router]);

  const loadDeviceSessions = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      const sessions = await mobileApi.getSessions(accessToken);
      
      // Sort: Current device first, then by lastUsedAt desc
      const sorted = [...sessions].sort((a, b) => {
        if (a.deviceId === currentDeviceId) return -1;
        if (b.deviceId === currentDeviceId) return 1;
        
        const timeA = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const timeB = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return timeB - timeA;
      });
      
      setDevices(sorted);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        await handleSessionRevoked();
        return;
      }
      setDevices([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, handleSessionRevoked, currentDeviceId]);

  useFocusEffect(
    useCallback(() => {
      loadDeviceSessions();
    }, [loadDeviceSessions])
  );

  const onForceLogoutDevice = async (session: DeviceSession) => {
    if (!accessToken) return;

    const isThisDevice = session.deviceId === currentDeviceId;

    Alert.alert(
      isThisDevice ? 'Đăng xuất' : 'Đăng xuất thiết bị', 
      isThisDevice 
        ? 'Bạn có chắc chắn muốn đăng xuất khỏi ứng dụng trên thiết bị này?'
        : `Bạn có chắc chắn muốn đăng xuất khỏi ${session.deviceName}?`, 
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                if (isThisDevice) {
                  await logout();
                  router.replace('/login');
                  return;
                }
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
      ]
    );
  };

  const AnyFlashList = FlashList as any;

  const renderDeviceItem = ({ item }: { item: DeviceSession }) => {
    const isThisDevice = item.deviceId === currentDeviceId;
    const lastUsed = item.lastUsedAt ? dayjs(item.lastUsedAt).fromNow() : 'Không rõ';
    
    return (
      <View className={`flex-row items-center p-4 rounded-xl mb-3 ${isThisDevice ? 'bg-blue-50 border border-blue-100' : 'bg-white border border-gray-100'}`}>
        <View className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${isThisDevice ? 'bg-blue-100' : 'bg-gray-100'}`}>
          <MaterialCommunityIcons 
            name={getPlatformIcon(item.platform)} 
            size={24} 
            color={isThisDevice ? '#1E88E5' : '#666'} 
          />
        </View>

        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className={`font-bold text-base ${isThisDevice ? 'text-blue-800' : 'text-gray-800'}`}>
              {item.deviceName}
            </Text>
            {isThisDevice && (
              <View className="ml-2 px-2 py-0.5 bg-blue-600 rounded-full">
                <Text className="text-[10px] text-white font-bold">THIẾT BỊ NÀY</Text>
              </View>
            )}
          </View>
          
          <Text className="text-xs text-gray-500 mt-1">
            {item.platform} • {item.ipAddress}
          </Text>
          
          <View className="flex-row items-center mt-1">
            <View className={`w-2 h-2 rounded-full mr-2 ${item.isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
            <Text className={`text-xs ${item.isOnline ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
              {item.isOnline ? 'Đang hoạt động' : `Sử dụng ${lastUsed}`}
            </Text>
          </View>
        </View>

        <Pressable
          className={`ml-2 p-2 rounded-full ${isThisDevice ? 'bg-blue-50' : 'bg-gray-50'}`}
          onPress={() => onForceLogoutDevice(item)}
        >
          <MaterialCommunityIcons 
            name={isThisDevice ? 'logout' : 'close-circle-outline'} 
            size={22} 
            color={isThisDevice ? '#1E88E5' : '#FF5252'} 
          />
        </Pressable>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-gray-50">
      <Appbar.Header style={{ backgroundColor: '#1E88E5', elevation: 0 }}>
        <Appbar.BackAction color="white" onPress={() => router.back()} />
        <Appbar.Content title="Quản lý thiết bị" titleStyle={{ color: 'white', fontWeight: 'bold' }} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="p-4">
          <View className="bg-blue-50 p-4 rounded-2xl mb-6 border border-blue-100">
            <Text className="text-blue-800 text-sm leading-5">
              Dưới đây là danh sách các thiết bị đã đăng nhập vào tài khoản của bạn. 
              Bạn có thể đăng xuất từ xa nếu nhận thấy có hoạt động lạ.
            </Text>
          </View>

          <Text className="text-gray-500 font-bold text-xs uppercase mb-3 ml-1 tracking-wider">
            Các thiết bị đang đăng nhập
          </Text>

          {isLoading ? (
            <View className="py-12 items-center">
              <ActivityIndicator color="#1E88E5" size="large" />
              <Text className="text-gray-400 mt-4">Đang tải danh sách...</Text>
            </View>
          ) : (
            <AnyFlashList
              data={devices}
              keyExtractor={(item: DeviceSession) => item.deviceId}
              scrollEnabled={false}
              ListEmptyComponent={
                <View className="py-12 items-center bg-white rounded-2xl border border-gray-100">
                  <MaterialCommunityIcons name="cellphone-off" size={48} color="#ccc" />
                  <Text className="text-gray-400 mt-4 text-center px-8">
                    Không tìm thấy thiết bị nào khác đang hoạt động.
                  </Text>
                </View>
              }
              renderItem={renderDeviceItem}
              estimatedItemSize={100}
            />
          )}

          <View className="mt-8 mb-4 items-center">
            <Text className="text-gray-400 text-xs text-center">
              Zalo bảo mật tài khoản của bạn bằng cách mã hóa các phiên đăng nhập.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
