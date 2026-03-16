import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, Text, TextInput, View } from 'react-native';

import { normalizeList } from '@/lib/api/normalize-list';
import { useAuth } from '@/providers/auth-provider';
import { mobileApi } from '@/services/api';

type ChatItem = {
      id: string;
      name?: string;
      type?: string;
      unreadCount?: number;
      lastMessage?: {
            content?: string;
            createdAt?: string;
      };
      updatedAt?: string;
      members?: { displayName?: string }[];
};

function deriveConversationName(item: ChatItem, directMessageText: string, conversationText: string): string {
      if (item.name && item.name.trim()) {
            return item.name;
      }

      if (item.type === 'DIRECT' && item.members?.length) {
            return item.members[0]?.displayName || directMessageText;
      }

      return conversationText;
}

export function ChatsScreen() {
      const { accessToken } = useAuth();
      const { t } = useTranslation();

      const [items, setItems] = useState<ChatItem[]>([]);
      const [search, setSearch] = useState('');
      const [isLoading, setIsLoading] = useState(true);
      const [isRefreshing, setIsRefreshing] = useState(false);

      const loadData = useCallback(async () => {
            if (!accessToken) {
                  return;
            }

            const response = await mobileApi.getConversations(accessToken);
            setItems(normalizeList<ChatItem>(response));
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

      const filteredItems = useMemo(() => {
            const keyword = search.trim().toLowerCase();

            if (!keyword) {
                  return items;
            }

            return items.filter((item) => {
                  const name = deriveConversationName(item, t('chats.directMessage'), t('chats.conversation')).toLowerCase();
                  const lastMessage = item.lastMessage?.content?.toLowerCase() ?? '';
                  return name.includes(keyword) || lastMessage.includes(keyword);
            });
      }, [items, search, t]);

      if (isLoading) {
            return (
                  <View className="flex-1 items-center justify-center">
                        <ActivityIndicator />
                  </View>
            );
      }

      return (
            <View className="flex-1 bg-background p-4">
                  <Text className="mb-3 text-2xl font-bold text-foreground">{t('tabs.chats')}</Text>

                  <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder={t('chats.searchPlaceholder')}
                        className="mb-3 rounded-xl border border-border bg-secondary px-3 py-2.5 text-foreground"
                  />

                  <FlashList
                        data={filteredItems}
                        keyExtractor={(item, index) => item.id || String(index)}
                        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
                        ListEmptyComponent={<Text className="mt-10 text-center text-muted">{t('chats.empty')}</Text>}
                        renderItem={({ item }) => {
                              const name = deriveConversationName(item, t('chats.directMessage'), t('chats.conversation'));
                              const preview = item.lastMessage?.content ?? t('chats.noMessage');

                              return (
                                    <View className="mb-2.5 rounded-xl border border-border bg-secondary p-3">
                                          <View className="flex-row items-center justify-between">
                                                <Text className="mr-2 flex-1 font-bold text-foreground">{name}</Text>
                                                {item.unreadCount ? (
                                                      <View className="h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5">
                                                            <Text className="text-xs font-bold text-primary-foreground">{item.unreadCount}</Text>
                                                      </View>
                                                ) : null}
                                          </View>
                                          <Text className="mt-1.5 text-muted" numberOfLines={1}>
                                                {preview}
                                          </Text>
                                    </View>
                              );
                        }}
                  />
            </View>
      );
}
