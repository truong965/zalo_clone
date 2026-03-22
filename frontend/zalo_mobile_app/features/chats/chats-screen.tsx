import { FlashList } from '@shopify/flash-list';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ConversationItem } from './components/conversation-item';
import { ConversationActionSheet } from './components/conversation-action-sheet';
import { useConversationsList } from './hooks/use-conversations-list';
import { useConversationActions } from './hooks/use-conversation-actions';
import { useConversationRealtime } from './hooks/use-conversation-realtime';
import { useMarkAsSeen } from './hooks/use-mark-as-seen';
import { Conversation } from '@/types/conversation';

export function ChatsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isActionSheetVisible, setIsActionSheetVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    data,
    isLoading,
    isRefetching,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage
  } = useConversationsList();

  const { pinConversation, muteConversation } = useConversationActions();
  const { markAsSeen } = useMarkAsSeen();
  useConversationRealtime();

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const flattenedData = useMemo(() => {
    return data?.pages.flatMap((page) => page.data) ?? [];
  }, [data]);

  const handlePress = useCallback((id: string) => {
    const conv = flattenedData.find((c) => c.id === id);
    if (conv && conv.unreadCount > 0) {
      markAsSeen(id, conv.lastMessage?.id);
    }
    
    router.push({
      pathname: `/chat/${id}` as any,
    });
  }, [router, flattenedData, markAsSeen]);

  const handleLongPress = useCallback((id: string) => {
    const conv = flattenedData.find(c => c.id === id);
    if (conv) {
      setSelectedConversation(conv);
      setIsActionSheetVisible(true);
    }
  }, [flattenedData]);

  const handlePin = useCallback((id: string, isPinned: boolean) => {
    pinConversation({ id, isPinned });
  }, [pinConversation]);

  const handleMute = useCallback((id: string) => {
    muteConversation(id);
  }, [muteConversation]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingBottom: insets.bottom }}>
      {flattenedData.length === 0 && !isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted-foreground text-lg">{t('chats.empty')}</Text>
        </View>
      ) : (
        (() => {
          const AnyFlashList = FlashList as any;
          return (
            <AnyFlashList
              data={flattenedData}
              keyExtractor={(item: Conversation) => item.id}
              renderItem={({ item }: { item: Conversation }) => (
                <ConversationItem
                  conversation={item}
                  onPress={handlePress}
                  onLongPress={handleLongPress}
                />
              )}
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) {
                  fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.5}
              refreshControl={
                <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
              }
              ListFooterComponent={
                isFetchingNextPage ? (
                  <View className="py-4">
                    <ActivityIndicator />
                  </View>
                ) : null
              }
              estimatedItemSize={88}
            />
          );
        })()
      )}

      <ConversationActionSheet
        visible={isActionSheetVisible}
        conversation={selectedConversation}
        onDismiss={() => setIsActionSheetVisible(false)}
        onPin={handlePin}
        onMute={handleMute}
      />
    </View>
  );
}
