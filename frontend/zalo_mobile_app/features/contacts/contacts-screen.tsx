import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, Text, View } from 'react-native';

import { normalizeList } from '@/lib/api/normalize-list';
import { useAuth } from '@/providers/auth-provider';
import { mobileApi } from '@/services/api';

type ContactItem = {
      id: string;
      displayName?: string;
      phoneNumber?: string;
      user?: {
            displayName?: string;
            phoneNumber?: string;
      };
};

export function ContactsScreen() {
      const { accessToken } = useAuth();
      const { t } = useTranslation();

      const [items, setItems] = useState<ContactItem[]>([]);
      const [isLoading, setIsLoading] = useState(true);
      const [isRefreshing, setIsRefreshing] = useState(false);

      const loadData = useCallback(async () => {
            if (!accessToken) {
                  return;
            }

            const response = await mobileApi.getFriends(accessToken);
            setItems(normalizeList<ContactItem>(response));
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
                  <FlashList
                        data={items}
                        keyExtractor={(item, index) => item.id || String(index)}
                        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
                        ListEmptyComponent={<Text className="mt-10 text-center text-muted">{t('contacts.empty')}</Text>}
                        renderItem={({ item }) => {
                              const name = item.displayName ?? item.user?.displayName ?? t('contacts.defaultUser');
                              const phone = item.phoneNumber ?? item.user?.phoneNumber ?? t('contacts.noPhone');

                              return (
                                    <View className="mb-2.5 rounded-xl border border-border bg-secondary p-3">
                                          <Text className="font-bold text-foreground">{name}</Text>
                                          <Text className="mt-1 text-muted">{phone}</Text>
                                    </View>
                              );
                        }}
                  />
            </View>
      );
}
