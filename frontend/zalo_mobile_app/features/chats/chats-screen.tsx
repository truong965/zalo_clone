import { Conversation } from '@/types/conversation';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useSyncContacts } from '../contacts/hooks/use-sync-contacts';
import { ConversationActionSheet } from './components/conversations/conversation-action-sheet';
import { ConversationItem } from './components/conversations/conversation-item';
import { useConversationActions } from './hooks/use-conversation-actions';
import { useConversationsList } from './hooks/use-conversations-list';
import { useMarkAsSeen } from './hooks/use-mark-as-seen';

export function ChatsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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

  const { isSyncing, performSync } = useSyncContacts();

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
    pinConversation(id, isPinned);
  }, [pinConversation]);

  const handleMute = useCallback((id: string, isMuted: boolean) => {
    muteConversation(id, isMuted);
  }, [muteConversation]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {flattenedData.length === 0 && !isLoading ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="items-center mb-6">
            <View className="w-20 h-20 bg-primary/10 rounded-full items-center justify-center mb-4">
              <Ionicons name="chatbubbles-outline" size={40} color="#1E88E5" />
            </View>
            <Text className="text-xl font-bold text-foreground mb-2 text-center">
              Chào mừng bạn đến với Zalo
            </Text>
            <Text className="text-muted-foreground text-center">
              Hãy kết nối với bạn bè để bắt đầu trò chuyện
            </Text>
          </View>

          <Button
            mode="contained"
            onPress={performSync}
            loading={isSyncing}
            disabled={isSyncing}
            className="w-full mb-3 py-1"
            icon={() => <Ionicons name="people-outline" size={20} color="white" />}
          >
            Tìm bạn từ danh bạ
          </Button>

          <Button
            mode="outlined"
            onPress={() => router.push('/search')}
            className="w-full py-1"
          >
            Tìm kiếm bạn bè
          </Button>
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
