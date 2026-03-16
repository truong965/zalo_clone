import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, Text, View } from 'react-native';

import { normalizeList } from '@/lib/api/normalize-list';
import { useAuth } from '@/providers/auth-provider';
import { mobileApi } from '@/services/api';

type CallItem = {
      id: string;
      type?: string;
      status?: string;
      startedAt?: string;
      endedAt?: string;
      caller?: { displayName?: string };
      receiver?: { displayName?: string };
};

export function CallsScreen() {
      const { accessToken } = useAuth();
      const { t } = useTranslation();

      const [items, setItems] = useState<CallItem[]>([]);
      const [isLoading, setIsLoading] = useState(true);
      const [isRefreshing, setIsRefreshing] = useState(false);

      const loadData = useCallback(async () => {
            if (!accessToken) {
                  return;
            }

            const response = await mobileApi.getCallHistory(accessToken);
            setItems(normalizeList<CallItem>(response));
      }, [accessToken]);

      useFocusEffect(
            useCallback(() => {
                  setIsLoading(true);
                  loadData()
                        .catch(() => setItems([]))
                        .finally(() => setIsLoading(false));
            }, [loadData]),
      );

      const onRefresh = async () => {
            setIsRefreshing(true);
            try {
                  await loadData();
            } finally {
                  setIsRefreshing(false);
            }
      };

      if (isLoading) {
            return (
                  <View className="flex-1 items-center justify-center">
                        <ActivityIndicator />
                  </View>
            );
      }

      return (
            <View className="flex-1 bg-background p-4">
                  <Text className="mb-3 text-2xl font-bold text-foreground">{t('calls.title')}</Text>
                  <FlashList
                        data={items}
                        keyExtractor={(item, index) => item.id || String(index)}
                        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
                        ListEmptyComponent={<Text className="mt-10 text-center text-muted">{t('calls.empty')}</Text>}
                        renderItem={({ item }) => {
                              const caller = item.caller?.displayName ?? t('common.unknown');
                              const receiver = item.receiver?.displayName ?? t('common.unknown');

                              return (
                                    <View className="mb-2.5 rounded-xl border border-border bg-secondary p-3">
                                          <Text className="font-bold text-foreground">{`${caller} -> ${receiver}`}</Text>
                                          <Text className="mt-1 text-muted">
                                                {t('calls.type')}: {item.type ?? t('calls.na')}
                                          </Text>
                                          <Text className="mt-1 text-muted">
                                                {t('calls.status')}: {item.status ?? t('calls.na')}
                                          </Text>
                                    </View>
                              );
                        }}
                  />
            </View>
      );
}
