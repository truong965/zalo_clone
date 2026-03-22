import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View, TouchableOpacity } from 'react-native';
import { useTheme, Button } from 'react-native-paper';

import { useAuth } from '@/providers/auth-provider';
import { mobileApi } from '@/services/api';
import { CallHistoryItem } from '@/types/call';
import { CallItem } from './components/call-item';

type CallTab = 'all' | 'missed';

export function CallsScreen() {
  const { accessToken, user } = useAuth();
  const theme = useTheme();

  const [activeTab, setActiveTab] = useState<CallTab>('all');
  const [items, setItems] = useState<CallHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!accessToken) return;

    try {
      const status = activeTab === 'missed' ? 'MISSED' : undefined;
      const response = await mobileApi.getCallHistory(accessToken, status);
      setItems(response.data);
    } catch (error) {
      console.error('Error loading call history:', error);
      setItems([]);
    }
  }, [accessToken, activeTab]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      loadData().finally(() => setIsLoading(false));
    }, [loadData])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadData().finally(() => setIsRefreshing(false));
  };

  const handleCall = (item: CallHistoryItem) => {
    console.log('Calling back', item.id);
    // Placeholder for call functionality
  };

  const handleMarkAllViewed = async () => {
    if (!accessToken) return;
    try {
      await mobileApi.markMissedCallsAsViewed(accessToken);
      loadData();
    } catch (error) {
      console.error('Error marking calls as viewed:', error);
    }
  };

  const renderHeader = () => (
    <View className="flex-row bg-primary px-2">
      {(['all', 'missed'] as CallTab[]).map((tab) => {
        const isActive = activeTab === tab;
        const labels: Record<CallTab, string> = {
          all: 'Tất cả',
          missed: 'Bị nhỡ',
        };
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`flex-1 items-center py-3 border-b-2 ${isActive ? 'border-white' : 'border-transparent'}`}
          >
            <Text className={`font-bold ${isActive ? 'text-white' : 'text-white/60'}`}>
              {labels[tab]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const AnyFlashList = FlashList as any;

  return (
    <View className="flex-1 bg-[#f4f5f7]">
      {renderHeader()}

      <View className="flex-1">
        {isLoading && !isRefreshing ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <AnyFlashList
            data={items}
            renderItem={({ item }: { item: CallHistoryItem }) => (
              <CallItem
                item={item}
                currentUserId={user?.id || ''}
                onCall={handleCall}
              />
            )}
            estimatedItemSize={80}
            keyExtractor={(item: CallHistoryItem) => item.id}
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            ListHeaderComponent={activeTab === 'missed' && items.length > 0 ? (
              <Button onPress={handleMarkAllViewed} mode="text" labelStyle={{ fontSize: 13 }}>
                Đánh dấu đã đọc tất cả
              </Button>
            ) : null}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center pt-20">
                <Text className="text-muted-foreground">
                  {activeTab === 'all' ? 'Không có lịch sử cuộc gọi' : 'Không có cuộc gọi nhỡ'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}
