import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { Message, MessageType } from '@/types/message';
import { ChatHeader } from '../../features/chats/components/chat-header';
import { ChatInput } from '../../features/chats/components/chat-input';
import { MessageItem } from '../../features/chats/components/message-item';
import { SystemMessage } from '../../features/chats/components/system-message';
import { MessageSeparator } from '../../features/chats/components/message-separator';
import { useChatRealtime, useMessagesList, useSendMessage } from '../../features/chats/hooks/use-chat-hooks';

export default function ChatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, accessToken } = useAuth();
  const queryKey = ['messages', id];

  // Fetch conversation detail for the header
  const { data: conversation } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => mobileApi.getConversation(id, accessToken!),
    enabled: !!id && !!accessToken,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading
  } = useMessagesList(id);

  const sendMessageMutation = useSendMessage();
  useChatRealtime(id);

  const messages = useMemo(() => {
    return data?.pages.flatMap(page => page.data) || [];
  }, [data]);

  const handleSend = useCallback((content: string) => {
    sendMessageMutation.mutate({
      conversationId: id,
      content,
      type: 'TEXT',
      clientMessageId: Date.now().toString(),
    });
  }, [id, sendMessageMutation]);

  const renderItem = useCallback(({ item, index }: { item: Message, index: number }) => {
    // Handle system messages separately
    if (item.type === MessageType.SYSTEM) {
      return <SystemMessage message={item} />;
    }

    const isMe = item.senderId === user?.id;
    const nextMessage = messages[index + 1]; // Since list is inverted, next is actually previous in time
    const prevMessage = messages[index - 1]; // prev is actually next in time

    // Logic for showing avatar and sender name (only in groups and for others)
    const isGroup = conversation?.type === 'GROUP';
    const showAvatar = !isMe && (index === 0 || messages[index - 1]?.senderId !== item.senderId);
    const showSenderName = isGroup && !isMe && (index === messages.length - 1 || messages[index + 1]?.senderId !== item.senderId);

    // Date separator logic
    const showSeparator = index === messages.length - 1 ||
      new Date(item.createdAt).toDateString() !== new Date(messages[index + 1]?.createdAt).toDateString();

    // Show time only when:
    // 1. Last message in list (most recent)
    // 2. Sender changes (the last message from a sender before switching to another sender)
    const isLastMessage = index === 0;
    const isSenderChange = prevMessage && prevMessage.senderId !== item.senderId;
    const showTime = isLastMessage || isSenderChange;

    return (
      <View>
        {showSeparator && <MessageSeparator date={item.createdAt} />}
        <MessageItem
          message={item}
          isMe={isMe}
          showAvatar={showAvatar}
          showSenderName={showSenderName}
          showTime={showTime}
        />
      </View>
    );
  }, [user?.id, messages, conversation?.type]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ChatHeader conversation={conversation as any} />

      <View className="flex-1">
        {(() => {
          const AnyFlashList = FlashList as any;
          return (
            <AnyFlashList
              data={messages}
              renderItem={renderItem}
              keyExtractor={(item: Message) => item.id}
              inverted
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) {
                  fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.5}
              estimatedItemSize={80}
              ListFooterComponent={isFetchingNextPage ? <ActivityIndicator className="my-2" /> : null}
            />
          );
        })()}
      </View>

      <ChatInput onSend={handleSend} />
    </KeyboardAvoidingView>
  );
}
