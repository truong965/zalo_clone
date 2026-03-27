import { useRouter } from 'expo-router';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { Appbar, List, Divider } from 'react-native-paper';
import { useState, useEffect } from 'react';
import { useNotificationStore } from '@/lib/notification-settings';

export default function NotificationsScreen() {
  const router = useRouter();
  const { isEnabled, setEnabled, isCallEnabledInApp, setCallEnabledInApp } = useNotificationStore();

  const toggleGlobal = async () => {
    setEnabled(!isEnabled);
  };

  const toggleCallInApp = async () => {
    setCallEnabledInApp(!isCallEnabledInApp);
  };

  return (
    <View className="flex-1 bg-background">
      <Appbar.Header style={{ backgroundColor: '#1E88E5' }}>
        <Appbar.BackAction color="white" onPress={() => router.back()} />
        <Appbar.Content title="Thông báo" titleStyle={{ color: 'white' }} />
      </Appbar.Header>

      <View className="p-4">
        <Text className="text-muted-foreground mb-4">
          Tùy chỉnh cách bạn nhận thông báo từ ứng dụng.
        </Text>

        <List.Item
          title="Cho phép thông báo"
          description="Tắt để ngừng nhận tất cả thông báo từ ứng dụng này"
          right={() => (
            <Switch
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={isEnabled ? '#1E88E5' : '#f4f3f4'}
              onValueChange={toggleGlobal}
              value={isEnabled}
            />
          )}
        />
        <Divider />

        <List.Item
          title="Nhận cuộc gọi khi đang dùng app"
          description="Cho phép hiện giao diện cuộc gọi đến khi bạn đang mở ứng dụng"
          right={() => (
            <Switch
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={isCallEnabledInApp ? '#1E88E5' : '#f4f3f4'}
              onValueChange={toggleCallInApp}
              value={isCallEnabledInApp}
            />
          )}
        />
        <Divider />
      </View>
    </View>
  );
}
