import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useTheme } from 'react-native-paper';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Platform,
  View,
  StyleSheet,
  Pressable,
  Text,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import Toast from 'react-native-toast-message';
import { Message, MessageType } from '@/types/message';
import { ChatHeader } from '@/features/chats/components/chat-header';
import { ChatInput } from '@/features/chats/components/chat-input';
import { MessageItem } from '@/features/chats/components/message-item/index';
import { SystemMessage } from '@/features/chats/components/message-item/system-message';
import { MessageSeparator } from '@/features/chats/components/message-item/message-separator';
import {
  useChatRealtime,
  useDeleteMessageForMe,
  useForwardMessage,
  useMessagesList,
  useRecallMessage,
  useSendMessage,
} from '@/features/chats/hooks/use-chat-hooks';
import { useJumpToMessage } from '@/features/chats/hooks/use-jump-to-message';
import { usePinMessage } from '@/features/chats/hooks/use-pin-message';
import { PinnedMessagesHeader } from '@/features/chats/components/pinned-messages-header';
import { MessageActionSheet } from '@/features/chats/components/message-action-sheet';
import { ForwardMessageModal } from '@/features/chats/components/modals/forward-message-modal';
import { useChatStore } from '@/features/chats/stores/chat.store';
import { useMarkAsSeen } from '@/features/chats/hooks/use-mark-as-seen';
import { MediaViewerModal } from '@/features/chats/components/media-viewer-modal';
import { useCallStore } from '@/features/calls/stores/call.store';
import { ActiveGroupCallBanner } from '@/features/chats/components/ActiveGroupCallBanner';
import { useHeaderHeight } from '@react-navigation/elements';

const uuidv4 = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const MVCP_NORMAL = { startRenderingFromBottom: true } as const;
const MVCP_JUMP = {} as const;

const ChatMessage = React.memo(
  ({
    item, isMe, isDirect, isLatestMyMessage,
    showAvatar, showSenderName, showTime, showSeparator,
    onLongPress, onJumpToMessage, onMediaPress, isHighlighted,
    onRetry, conversationId, isPinned, onPin, onUnpin,
    onRecall, onDeleteForMe,
    onForward,
  }: {
    item: Message;
    isMe: boolean;
    isDirect: boolean;
    isLatestMyMessage: boolean;
    conversationId: string;
    showAvatar: boolean;
    showSenderName: boolean;
    showTime: boolean;
    showSeparator: boolean;
    onLongPress?: (msg: Message) => void;
    onJumpToMessage?: (msgId: string) => void;
    onMediaPress?: (mediaId: string) => void;
    isHighlighted?: boolean;
    onRetry?: (msg: Message) => void;
    isPinned?: boolean;
    onPin?: (msg: Message) => void;
    onUnpin?: (msg: Message) => void;
    onRecall?: (msg: Message) => void;
    onDeleteForMe?: (msg: Message) => void;
    onForward?: (msg: Message) => void;
  }) => {
    if (item.type === MessageType.SYSTEM) return <SystemMessage message={item} />;
    return (
      <View style={{ flexDirection: 'column' }}>
        {showSeparator && <MessageSeparator date={item.createdAt} />}
        <MessageItem
          message={item}
          isMe={isMe}
          isDirect={isDirect}
          isLatestMyMessage={isLatestMyMessage}
          conversationId={conversationId}
          isPinned={isPinned}
          showAvatar={showAvatar}
          showSenderName={showSenderName}
          showTime={showTime}
          onLongPress={onLongPress}
          onJumpToMessage={onJumpToMessage}
          onMediaPress={onMediaPress}
          onRetry={onRetry}
          onPin={onPin}
          onUnpin={onUnpin}
          onRecall={onRecall}
          onDeleteForMe={onDeleteForMe}
          onForward={onForward}
          isHighlighted={isHighlighted}
        />
      </View>
    );
  },
);

export default function ChatDetailScreen() {
  const { user, accessToken } = useAuth();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const queryClient = useQueryClient();
  const { data: conversation, error: convError } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => mobileApi.getConversation(id, accessToken!),
    enabled: !!id && !!accessToken,
    retry: false,
  });

  useEffect(() => {
    if (convError) {
      const status = (convError as any)?.status || (convError as any)?.response?.status;
      if (status === 400 || status === 404) {
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: 'Cuộc trò chuyện không tồn tại hoặc bạn không còn là thành viên',
        });

        // Prune from list cache
        queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData: any) => {
          if (!oldData || !oldData.pages) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              data: page.data.filter((c: any) => c.id !== id),
            })),
          };
        });

        router.dismissAll();
        router.replace('/(tabs)');
      }
    }
  }, [convError, id, queryClient, router]);

  const flashListRef = useRef<any>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useMessagesList(id, 'older');

  const sendMessageMutation = useSendMessage();
  const recallMessageMutation = useRecallMessage();
  const forwardMessageMutation = useForwardMessage();
  const deleteMessageForMeMutation = useDeleteMessageForMe();

  const handleRecall = useCallback(
    (msg: Message) => {
      recallMessageMutation.mutate({
        conversationId: id,
        messageId: msg.id,
      });
    },
    [id, recallMessageMutation],
  );

  const handleDeleteForMe = useCallback(
    (msg: Message) => {
      deleteMessageForMeMutation.mutate({
        conversationId: id,
        messageId: msg.id,
      });
    },
    [id, deleteMessageForMeMutation],
  );

  const {
    jumpToMessage,
    returnToLatest,
    isJumpedAway,
    highlightedId,
    loadNewer,
    isJumping,
    flashListKey,
    initialScrollIndex,
    // FIX Bug 2: Nhận refs để truyền vào useChatRealtime
    isJumpingRef,
    jumpBufferRef,
  } = useJumpToMessage({
    conversationId: id,
    // FIX Bug 1: Không còn truyền queryKey từ đây nữa.
    // useJumpToMessage tự dùng messagesQueryKey(conversationId) nội bộ,
    // đảm bảo luôn đúng key với useMessagesList và useChatRealtime.
    flashListRef,
    scrollToBottom: () => flashListRef.current?.scrollToEnd({ animated: true }),
  });

  // FIX Bug 2: Truyền jump guard refs vào useChatRealtime.
  // useChatRealtime sẽ buffer messages nhận trong lúc jump thay vì upsert ngay,
  // tránh race condition giữa socket update và contextual replace.
  useChatRealtime(id, { isJumpingRef, jumpBufferRef });

  const { pinnedMessages, pinMessage, unpinMessage } = usePinMessage(id);
  const { setReplyTarget, jumpToMessageId, setJumpToMessageId } = useChatStore();
  const { markAsSeen } = useMarkAsSeen();
  const headerHeight = useHeaderHeight();
  const [androidKeyboardInset, setAndroidKeyboardInset] = React.useState(0);

  const [selectedMsgForMenu, setSelectedMsgForMenu] = React.useState<Message | null>(null);
  const [forwardSourceMessage, setForwardSourceMessage] = React.useState<Message | null>(null);
  const [viewerState, setViewerState] = React.useState({ isVisible: false, initialIndex: 0 });
  const fetchingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLastMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  useEffect(() => {
    if (jumpToMessageId && jumpToMessage && accessToken) {
      jumpToMessage(jumpToMessageId);
      setJumpToMessageId(null);
    }
  }, [jumpToMessageId, jumpToMessage, setJumpToMessageId, accessToken]);


  const messages = useMemo(() => {
    if (!data?.pages) return [];
    const raw: Message[] = [];
    for (const page of data.pages)
      for (const msg of page.data) raw.push(msg);
    const visible = raw.filter((msg) => {
      const metadata = msg.metadata as Record<string, unknown> | undefined;
      const deletedForUserIds = metadata?.deletedForUserIds;
      return !(
        Array.isArray(deletedForUserIds) &&
        user?.id &&
        deletedForUserIds.includes(user.id)
      );
    });
    visible.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return visible;
  }, [data?.pages, user?.id]);

  const mediaSignature = useMemo(() => {
    return messages
      .filter(msg => !!msg.mediaAttachments?.length)
      .map(msg => msg.id + (msg.mediaAttachments?.map(a => a.id).join('') || ''))
      .join('|');
  }, [messages]);

  const allMediaItems = useMemo(() => {
    const media: any[] = [];
    messages.forEach(msg => {
      if (msg.mediaAttachments) {
        msg.mediaAttachments.forEach(att => {
          if (['IMAGE', 'VIDEO', 'VOICE', 'AUDIO'].includes(att.mediaType)) {
            media.push({
              ...att,
              id: att.id || `${msg.id}-${att.originalName}`,
              messageId: msg.id
            });
          }
        });
      }
    });
    return media;
  }, [mediaSignature]);

  const handleMediaPress = useCallback((mediaId: string) => {
    const idx = allMediaItems.findIndex(m => m.id === mediaId || m.mediaId === mediaId);
    if (idx !== -1) {
      setViewerState({ isVisible: true, initialIndex: idx });
    }
  }, [allMediaItems]);

  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];

    // Mark as seen if it's from someone else
    if (lastMsg.senderId !== user?.id) {
      markAsSeen(id, lastMsg.id.toString());
    }

    const lastId = lastMsg.id.toString();
    if (prevLastMessageIdRef.current !== null && prevLastMessageIdRef.current !== lastId) {
      if (initialScrollIndex === undefined) {
        flashListRef.current?.scrollToEnd({ animated: true });
      }
    }
    prevLastMessageIdRef.current = lastId;
  }, [messages, initialScrollIndex, id, user?.id, markAsSeen]);

  const isGroup = conversation?.type === 'GROUP';
  const isDirect = !isGroup;

  // Sync active group call status on mount
  useEffect(() => {
    if (id && accessToken && isGroup) {
      const syncActiveCall = async () => {
        try {
          // Phase 11: Add a small delay if currently IDLE to handle backend-settle time
          const currentCallStatus = useCallStore.getState().callStatus;
          if (currentCallStatus === 'IDLE') {
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          const res = await mobileApi.getActiveCall(id, accessToken);
          // Phase 7: Pass dailyRoomUrl for instant rejoin
          useCallStore.getState().setActiveGroupCall(id, res.active, res.dailyRoomUrl);
        } catch (err) {
          console.warn('[ChatScreen] Failed to fetch active call:', err);
        }
      };

      void syncActiveCall();
    }
  }, [id, accessToken, isGroup]);

  const latestMyMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--)
      if (messages[i].senderId === user?.id) return messages[i].id;
    return null;
  }, [messages, user?.id]);

  const handleStartReached = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || fetchingRef.current) return;
    if (messages.length === 0) return;
    fetchingRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      fetchNextPage().finally(() => {
        fetchingRef.current = false;
        timeoutRef.current = null;
      });
    }, 0);
  }, [hasNextPage, isFetchingNextPage, messages.length, fetchNextPage]);

  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      setAndroidKeyboardInset(event.endCoordinates.height);
      if (isAtBottomRef.current) {
        requestAnimationFrame(() => {
          flashListRef.current?.scrollToEnd({ animated: true });
        });
      }
    });

    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (messages.length === 0) return;
    const lastItem = messages[messages.length - 1];
    const isLastVisible = viewableItems.some((v: any) => v.item.id === lastItem.id);
    if (isAtBottomRef.current !== isLastVisible) {
      isAtBottomRef.current = isLastVisible;
      setIsAtBottom(isLastVisible);
    }
  }, [messages]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10,
    minimumViewTime: 50,
  }).current;

  const getItemType = useCallback(
    (item: Message) => item.type === MessageType.SYSTEM ? 'system' : 'message',
    [],
  );

  const handleRetry = useCallback(
    (message: Message) => {
      // Reconstruct local assets from media attachments
      const localAssets = message.mediaAttachments
        ?.filter(a => !!a._localUrl)
        .map(a => ({
          uri: a._localUrl!,
          fileName: a.originalName,
          mimeType: a.mimeType || 'application/octet-stream',
          fileSize: a.size || 0,
          type: (a.mediaType.toLowerCase() === 'image' || a.mediaType.toLowerCase() === 'video' || a.mediaType.toLowerCase() === 'document')
            ? a.mediaType.toLowerCase() as any
            : 'document',
        }));

      // Reconstruct reply target from parentMessage
      let replyTarget = undefined;
      if (message.parentMessage) {
        replyTarget = {
          messageId: message.parentMessage.id,
          senderName: message.parentMessage.sender?.displayName || 'Người dùng',
          content: message.parentMessage.content,
          type: message.parentMessage.type,
          mediaAttachments: message.parentMessage.mediaAttachments?.map((a: any) => ({
            mediaType: a.mediaType,
            originalName: a.originalName,
          })),
        };
      }

      sendMessageMutation.mutate({
        conversationId: id,
        content: message.content,
        type: message.type,
        clientMessageId: message.clientMessageId || uuidv4(),
        mediaIds: message.mediaAttachments?.filter(a => !a._localUrl).map(a => a.id),
        replyTarget,
        localAssets,
      });
    },
    [id, sendMessageMutation]
  );

  const handleForward = useCallback((msg: Message) => {
    setForwardSourceMessage(msg);
  }, []);

  const handleSubmitForward = useCallback(
    async (payload: {
      sourceMessageId: string;
      targetConversationIds: string[];
      includeCaption?: boolean;
    }) => {
      try {
        await forwardMessageMutation.mutateAsync({
          ...payload,
          clientRequestId: uuidv4(),
        });
        setForwardSourceMessage(null);
      } catch {
        // Error toast is handled inside useForwardMessage
      }
    },
    [forwardMessageMutation],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const olderMessage = messages[index - 1];
      const newerMessage = messages[index + 1];
      const isMe = item.senderId === user?.id;
      const isFirstInGroup = !olderMessage || olderMessage.senderId !== item.senderId;
      const isLastInGroup = !newerMessage || newerMessage.senderId !== item.senderId;
      const showSeparator =
        !olderMessage ||
        new Date(item.createdAt).toDateString() !== new Date(olderMessage.createdAt).toDateString();

      return (
        <ChatMessage
          item={item}
          isMe={isMe}
          isDirect={isDirect}
          isLatestMyMessage={item.id === latestMyMessageId}
          conversationId={id}
          isPinned={pinnedMessages.some((m) => m.id === item.id)}
          showAvatar={!isMe && isFirstInGroup}
          showSenderName={isGroup && !isMe && isFirstInGroup}
          showTime={isLastInGroup}
          showSeparator={showSeparator}
          onLongPress={setSelectedMsgForMenu}
          onJumpToMessage={jumpToMessage}
          onMediaPress={handleMediaPress}
          onRetry={handleRetry}
          onPin={(msg) => pinMessage(msg.id)}
          onUnpin={(msg) => unpinMessage(msg.id)}
          onRecall={handleRecall}
          onDeleteForMe={handleDeleteForMe}
          onForward={handleForward}
          isHighlighted={item.id.toString() === highlightedId?.toString()}
        />
      );
    },
    [user?.id, messages, isGroup, isDirect, latestMyMessageId,
      setSelectedMsgForMenu, jumpToMessage, handleMediaPress, handleRetry,
      handleRecall, handleDeleteForMe, handleForward, highlightedId],
  );

  const handleSend = useCallback(
    (content: string, type: MessageType = MessageType.TEXT, mediaIds?: string[], replyTarget?: any, localAssets?: any[]) => {
      sendMessageMutation.mutate({
        conversationId: id,
        content,
        type,
        clientMessageId: uuidv4(),
        mediaIds,
        replyTarget,
        localAssets,
      });
    },
    [id, sendMessageMutation],
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#eef2f7' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ChatHeader conversation={null} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  const isJumpMode = initialScrollIndex !== undefined;

  return (
    <View style={{ flex: 1, backgroundColor: '#eef2f7' }}>
      <Stack.Screen options={{ headerShown: false }} />

      <ChatHeader conversation={conversation as any} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        <PinnedMessagesHeader
          pinnedMessages={pinnedMessages}
          onViewAllPinned={() => router.push(`/chat/${id}/pinned`)}
        />

        <ActiveGroupCallBanner
          conversationId={id}
          displayName={conversation?.name || 'Hội thoại'}
          avatarUrl={conversation?.avatarUrl}
        />

        <View style={{ flex: 1 }}>
          <FlashList
            key={flashListKey}
            ref={flashListRef}
            maintainVisibleContentPosition={isJumpMode ? MVCP_JUMP : MVCP_NORMAL}
            initialScrollIndex={initialScrollIndex}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item: Message) => item.id.toString()}
            getItemType={getItemType}
            onStartReached={handleStartReached}
            onStartReachedThreshold={0.3}
            onEndReached={isJumpedAway ? loadNewer : undefined}
            onEndReachedThreshold={0.2}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            contentContainerStyle={{
              paddingHorizontal: 12,
              paddingBottom: 10,
              paddingTop: 10,
            }}
            ListHeaderComponent={
              <View style={{ height: 40, justifyContent: 'center', alignItems: 'center' }}>
                {isFetchingNextPage && <ActivityIndicator color={theme.colors.primary} />}
              </View>
            }
            ListEmptyComponent={
              !isLoading && messages.length === 0 ? (
                <View style={{ flex: 1, paddingVertical: 100, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#666', fontSize: 16 }}>Không có tin nhắn</Text>
                </View>
              ) : null
            }
            drawDistance={500}
          />

          <JumpToLatestFAB
            show={(isJumpedAway || !isAtBottom) && messages.length > 0}
            onPress={returnToLatest}
          />

          {isJumping && (
            <View style={styles.jumpingOverlay}>
              <ActivityIndicator color="#ffffff" size="small" />
            </View>
          )}
        </View>

        <View style={Platform.OS === 'android' ? { paddingBottom: androidKeyboardInset } : undefined}>
          <ChatInput onSend={handleSend} conversationId={id} />
        </View>
      </KeyboardAvoidingView>

      <MessageActionSheet
        visible={!!selectedMsgForMenu}
        message={selectedMsgForMenu}
        isMe={selectedMsgForMenu?.senderId === user?.id}
        isPinned={!!selectedMsgForMenu && pinnedMessages.some(m => m.id === selectedMsgForMenu.id)}
        onDismiss={() => setSelectedMsgForMenu(null)}
        onReply={(msg) => {
          setReplyTarget({
            messageId: msg.id,
            senderName: msg.sender?.displayName || 'Người dùng',
            content: msg.content,
            type: msg.type,
            mediaAttachments: msg.mediaAttachments?.map((a) => ({
              mediaType: a.mediaType,
              originalName: a.originalName,
            })),
          });
        }}
        onPin={(msg) => pinMessage(msg.id)}
        onUnpin={(msg) => unpinMessage(msg.id)}
        onRecall={(msg) => {
          recallMessageMutation.mutate({
            conversationId: id,
            messageId: msg.id,
          });
        }}
        onForward={(msg) => {
          setForwardSourceMessage(msg);
        }}
        onDeleteForMe={(msg) => {
          deleteMessageForMeMutation.mutate({
            conversationId: id,
            messageId: msg.id,
          });
        }}
      />

      <ForwardMessageModal
        visible={!!forwardSourceMessage}
        sourceMessage={forwardSourceMessage}
        currentConversationId={id}
        isSubmitting={forwardMessageMutation.isPending}
        onDismiss={() => setForwardSourceMessage(null)}
        onSubmit={handleSubmitForward}
      />

      <MediaViewerModal
        isVisible={viewerState.isVisible}
        onClose={() => setViewerState({ ...viewerState, isVisible: false })}
        items={allMediaItems}
        initialIndex={viewerState.initialIndex}
      />
    </View>
  );
}

function JumpToLatestFAB({ show, onPress }: { show: boolean; onPress: () => void }) {
  if (!show) return null;
  return (
    <Pressable style={styles.fab} onPress={onPress}>
      <Ionicons name="chevron-down" size={24} color="#0091ff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  jumpingOverlay: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 20,
  },
});
