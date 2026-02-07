// src/features/chat/index.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ConversationSidebar } from './components/conversation-sidebar';
import { ChatHeader } from './components/chat-header';
import { ChatInput } from './components/chat-input';
import { ChatSearchSidebar } from './components/chat-search-sidebar';
import { ChatInfoSidebar } from './components/chat-info-sidebar';
import { ChatContent } from './components/chat-content';
import type { ChatConversation, RightSidebarState } from './types';
import { conversationService } from '@/services/conversation.service';
import { useConversationSocket } from '@/hooks/use-conversation-socket';
import { useMessageSocket } from '@/hooks/use-message-socket';
import { messageService } from '@/services/message.service';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { notification } from 'antd';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { useChatMessages } from './hooks/use-chat-messages';
import type { MessageListItem, MessageType } from '@/types/api';
import type { MessagesInfiniteData, MessagesPage } from '@/hooks/use-message-socket';

export function ChatFeature() {
      const [api, contextHolder] = notification.useNotification();
      const queryClient = useQueryClient();
      const currentUserId = useAuthStore((s) => s.user?.id ?? null);

      // --- STATE: UI ---
      const [selectedId, setSelectedId] = useState<string | null>(null);
      const [rightSidebar, setRightSidebar] = useState<RightSidebarState>('none');

      // --- REFS ---
      const messagesEndRef = useRef<HTMLDivElement>(null);
      const messagesContainerRef = useRef<HTMLDivElement>(null);

      // ============================================================================
      // 1. CONVERSATIONS LIST (Infinite Scroll - Forward)
      // ============================================================================

      const conversationsLimit = 20;
      const conversationsQueryKey = useMemo(
            () => ['conversations', { limit: conversationsLimit }] as const,
            [conversationsLimit],
      );

      type ConversationsPage = Awaited<ReturnType<typeof conversationService.getConversations>>;

      const conversationsQuery = useInfiniteQuery({
            queryKey: conversationsQueryKey,
            initialPageParam: undefined as string | undefined,
            queryFn: async ({ pageParam }) => {
                  return conversationService.getConversations({
                        cursor: pageParam,
                        limit: conversationsLimit,
                  });
            },
            getNextPageParam: (lastPage) => {
                  return lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined;
            },
      });

      const conversations = (conversationsQuery.data?.pages ?? []).flatMap((p) => p.data);
      const isLoadingConv = conversationsQuery.isLoading || conversationsQuery.isFetchingNextPage;
      const convHasMore = conversationsQuery.hasNextPage;

      const { ref: convLoadMoreRef, inView: convInView } = useInView({
            threshold: 0.1,
            rootMargin: '100px',
      });

      useEffect(() => {
            if (!convInView) return;
            if (!conversationsQuery.hasNextPage) return;
            if (conversationsQuery.isFetchingNextPage) return;
            void conversationsQuery.fetchNextPage();
      }, [convInView, conversationsQuery]);

      const prependConversation = useCallback((item: ChatConversation) => {
            queryClient.setQueryData<InfiniteData<ConversationsPage, string | undefined>>(
                  conversationsQueryKey,
                  (prev) => {
                        if (!prev) {
                              return {
                                    pages: [{ data: [item], meta: { limit: conversationsLimit, hasNextPage: false } }],
                                    pageParams: [undefined],
                              };
                        }

                        const pages = [...prev.pages];
                        const first = pages[0];
                        const exists = first.data.some((c) => c.id === item.id);
                        if (exists) return prev;

                        pages[0] = {
                              ...first,
                              data: [item, ...first.data],
                        };
                        return { ...prev, pages };
                  });
      }, [queryClient, conversationsQueryKey]);

      const updateConversation = useCallback((conversationId: string, updates: Partial<ChatConversation>) => {
            queryClient.setQueryData<InfiniteData<ConversationsPage, string | undefined>>(
                  conversationsQueryKey,
                  (prev) => {
                        if (!prev) return prev;
                        const pages = prev.pages.map((page) => ({
                              ...page,
                              data: page.data.map((c) => (c.id === conversationId ? { ...c, ...updates } : c)),
                        }));
                        return { ...prev, pages };
                  });
      }, [queryClient, conversationsQueryKey]);

      // ============================================================================
      // WebSocket - Realtime Events
      // ============================================================================

      useConversationSocket({
            onGroupCreated: (data) => {
                  // Add to top of conversation list
                  prependConversation(data.group as ChatConversation);
                  api.success({
                        message: 'Nhóm đã được tạo',
                        placement: 'topRight',
                        duration: 5,
                  });
            },

            onGroupUpdated: (data) => {
                  // Update conversation in list
                  updateConversation(data.conversationId, data.updates as Partial<ChatConversation>);
                  api.success({
                        message: 'Thông tin nhóm đã cập nhật',
                        placement: 'topRight',
                        duration: 5,
                  });
            },

            onGroupMembersAdded: (data) => {
                  api.success({
                        message: `${data.memberIds.length} thành viên đã được thêm`,
                        placement: 'topRight',
                        duration: 5,
                  });
            },

            onGroupMemberRemoved: (data) => {
                  console.log('⚠️ Member removed:', data);
                  api.warning({
                        message: 'Một thành viên đã bị xóa khỏi nhóm',
                        placement: 'topRight',
                        duration: 5,
                  });
            },

            onGroupMemberLeft: (data) => {
                  console.log('⚠️ Member left:', data);
                  api.info({
                        message: 'Một thành viên đã bị xóa khỏi nhóm',
                        placement: 'topRight',
                        duration: 5,
                  });
            },

            onGroupDissolved: (data) => {
                  console.log('🔴 Group dissolved:', data);
                  api.error({
                        message: 'Nhóm đã bị giải tán',
                        placement: 'topRight',
                        duration: 5,
                  });

                  // Remove conversation from list
                  // removeConversation(data.conversationId);
            },
      });

      // ============================================================================
      // 2. MESSAGES LIST (Infinite Scroll - Backward/Reverse)
      // ============================================================================

      const {
            messages,
            query: messagesQuery,
            isInitialLoad,
            loadOlder,
            queryKey: messagesQueryKey,
      } = useChatMessages({
            conversationId: selectedId,
            limit: 50,
            messagesContainerRef,
      });

      const { isConnected: isMsgSocketConnected, emitSendMessage } = useMessageSocket({
            conversationId: selectedId,
            messagesQueryKey,
      });

      const handleSendText = useCallback(async (text: string) => {
            if (!selectedId) return;
            const trimmed = text.trim();
            if (!trimmed) return;

            const clientMessageId = crypto.randomUUID();
            const nowIso = new Date().toISOString();

            const optimistic: MessageListItem = {
                  id: clientMessageId,
                  conversationId: selectedId,
                  senderId: currentUserId ?? undefined,
                  type: 'TEXT' as MessageType,
                  content: trimmed,
                  clientMessageId,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                  sender: currentUserId
                        ? { id: currentUserId, displayName: 'Bạn', avatarUrl: null }
                        : null,
                  parentMessage: null,
                  receipts: [],
                  mediaAttachments: [],
            };

            queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey, (prev) => {
                  if (!prev) {
                        return {
                              pages: [{ data: [optimistic], meta: { limit: 50, hasNextPage: false } } as MessagesPage],
                              pageParams: [undefined],
                        };
                  }
                  const pages = [...prev.pages];
                  const first = pages[0];
                  pages[0] = { ...first, data: [optimistic, ...first.data] };
                  return { ...prev, pages };
            });

            // Prefer socket when connected; fallback to HTTP
            if (isMsgSocketConnected) {
                  emitSendMessage({
                        conversationId: selectedId,
                        clientMessageId,
                        type: 'TEXT',
                        content: trimmed,
                  });
                  return;
            }

            try {
                  await messageService.sendMessage({
                        conversationId: selectedId,
                        clientMessageId,
                        type: 'TEXT' as MessageType,
                        content: trimmed,
                  });
            } catch {
                  api.error({ message: 'Gửi tin nhắn thất bại', placement: 'topRight' });
            }
      }, [selectedId, currentUserId, queryClient, messagesQueryKey, isMsgSocketConnected, emitSendMessage, api]);

      const msgHasMore = messagesQuery.hasNextPage;
      const isLoadingMsg = messagesQuery.isLoading || messagesQuery.isFetchingNextPage;

      const { ref: msgLoadMoreRef, inView: msgInView } = useInView({
            threshold: 0.1,
            rootMargin: '200px',
      });

      useEffect(() => {
            if (!msgInView) return;
            void loadOlder();
      }, [msgInView, loadOlder]);

      const handleSelectConversation = useCallback((id: string) => {
            // Nếu click lại vào người đang chat thì không làm gì
            if (id === selectedId) return;

            setSelectedId(id);
      }, [selectedId]); // Thêm dependencies

      const selectedConversation = conversations.find((c) => c.id === selectedId) as ChatConversation | undefined;

      return (
            <div className="h-full w-full flex overflow-hidden bg-gray-50">
                  {contextHolder}
                  <ConversationSidebar
                        conversations={conversations}
                        selectedId={selectedId}
                        onSelect={handleSelectConversation}
                        loadMoreRef={convLoadMoreRef}
                        hasMore={convHasMore}
                        isLoading={isLoadingConv}
                  />

                  <div className="flex-1 flex flex-col h-full overflow-hidden">
                        {selectedConversation ? (
                              <>
                                    <ChatHeader
                                          conversationName={selectedConversation.name || 'Chat'}
                                          onToggleSearch={() => setRightSidebar(prev => prev === 'search' ? 'none' : 'search')}
                                          onToggleInfo={() => setRightSidebar(prev => prev === 'info' ? 'none' : 'info')}
                                    />

                                    <ChatContent
                                          messages={messages}
                                          isLoadingMsg={isLoadingMsg}
                                          msgHasMore={msgHasMore}
                                          msgLoadMoreRef={msgLoadMoreRef}
                                          isInitialLoad={isInitialLoad}
                                          messagesContainerRef={messagesContainerRef}
                                          messagesEndRef={messagesEndRef}
                                    />

                                    <ChatInput conversationId={selectedId} onSend={handleSendText} />
                              </>
                        ) : (
                              <div className="flex-1 flex items-center justify-center text-gray-400">
                                    Chọn một cuộc trò chuyện để bắt đầu
                              </div>
                        )}
                  </div>

                  {rightSidebar === 'search' && <ChatSearchSidebar onClose={() => setRightSidebar('none')} />}
                  {rightSidebar === 'info' && <ChatInfoSidebar onClose={() => setRightSidebar('none')} />}
            </div>
      );
}