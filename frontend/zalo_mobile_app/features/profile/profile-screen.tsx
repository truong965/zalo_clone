import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Text, List, Divider, useTheme } from 'react-native-paper';

import { useAuth } from '@/providers/auth-provider';
import { UserAvatar } from '@/components/ui/user-avatar';

export function ProfileScreen() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const theme = useTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsRefreshing(true);
      refreshProfile().finally(() => setIsRefreshing(false));
    }, [refreshProfile]),
  );

  return (
    <ScrollView className="flex-1 bg-[#f4f5f7]">
      {/* User Header */}
      <View className="bg-background items-center py-8 px-4 flex-row border-b border-border/50">
        <UserAvatar uri={user?.avatarUrl} size={64} />
        <View className="ml-4 justify-center">
          <Text className="text-xl font-bold text-foreground">
            {user?.displayName || 'Người dùng'}
          </Text>
          <Text className="text-muted-foreground text-sm mt-0.5">
            Xem trang cá nhân
          </Text>
        </View>
      </View>

      <View className="mt-2 bg-background">
        <List.Item
          title="Quản lý thiết bị"
          left={props => <List.Icon {...props} icon="laptop" />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => router.push('/profile/devices')}
        />
      </View>

      <View className="mt-2 bg-background">
        <List.Item
          title="Quyền riêng tư"
          left={props => <List.Icon {...props} icon="lock-outline" />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => router.push('/profile/privacy')}
        />
        <Divider />
        <List.Item
          title="Thông báo"
          left={props => <List.Icon {...props} icon="bell-outline" />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => router.push('/profile/notifications')}
        />
        <Divider />
        <List.Item
          title="Tài khoản và bảo mật"
          left={props => <List.Icon {...props} icon="shield-check-outline" />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => router.push('/profile/security')}
        />
      </View>

      {isRefreshing && (
        <View className="mt-4">
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      )}
    </ScrollView>
  );
}
