// src/features/chat/index.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ConversationSidebar } from './components/conversation-sidebar';
import { ChatHeader } from './components/chat-header';
import { ChatInput } from './components/chat-input';
import { ChatSearchSidebar } from './components/chat-search-sidebar';
import { ChatInfoSidebar } from './components/chat-info-sidebar';
import { ChatContent } from './components/chat-content';
import { FriendshipSearchModal } from '@/features/contacts/components/friendship-search-modal';
import { SearchPanel } from '@/features/search/components/SearchPanel';
import type { ChatConversation, RightSidebarState } from './types';
import { conversationService } from '@/services/conversation.service';
import { useConversationSocket } from '@/hooks/use-conversation-socket';
import { useMessageSocket } from '@/hooks/use-message-socket';
import { useConversationListRealtime } from '@/hooks/use-conversation-list-realtime';
import { useSocket } from '@/hooks/use-socket';
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
      const { isConnected: isSocketConnected, connectionNonce } = useSocket();

      const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

      // --- STATE: UI ---
      const [selectedId, setSelectedId] = useState<string | null>(
            () => sessionStorage.getItem('chat_selectedId') ?? null,
      );
      const [rightSidebar, setRightSidebar] = useState<RightSidebarState>('none');
      const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
      const [isFriendSearchOpen, setIsFriendSearchOpen] = useState(false);
      const [prefillSearchKeyword, setPrefillSearchKeyword] = useState<string | undefined>(undefined);

      // Persist selectedId to sessionStorage so F5 reload preserves it
      useEffect(() => {
            if (selectedId) {
                  sessionStorage.setItem('chat_selectedId', selectedId);
            } else {
                  sessionStorage.removeItem('chat_selectedId');
            }
      }, [selectedId]);

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

      useConversationListRealtime({
            conversationsQueryKey,
            selectedConversationId: selectedId,
      });

      const conversations = (conversationsQuery.data?.pages ?? []).flatMap((p) => p.data);
      const isLoadingConv = conversationsQuery.isLoading || conversationsQuery.isFetchingNextPage;
      const convHasMore = conversationsQuery.hasNextPage;

      const { ref: convLoadMoreRef, inView: convInView } = useInView({
            threshold: 0.1,
            rootMargin: '100px',
      });

      // Ref to access latest query state without re-creating callback
      const convQueryRef = useRef(conversationsQuery);
      convQueryRef.current = conversationsQuery;
      const convFetchingRef = useRef(false);

      const loadMoreConversations = useCallback(async () => {
            if (convFetchingRef.current) return;
            const q = convQueryRef.current;
            if (!q.hasNextPage || q.isFetchingNextPage) return;
            convFetchingRef.current = true;
            try {
                  await q.fetchNextPage();
            } finally {
                  convFetchingRef.current = false;
            }
      }, []);

      useEffect(() => {
            if (!convInView) return;
            void loadMoreConversations();
      }, [convInView, loadMoreConversations]);

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

                        // Remove from ALL pages to avoid duplicates (conversation may exist in page 2+)
                        const cleaned = prev.pages.map((page) => ({
                              ...page,
                              data: page.data.filter((c) => c.id !== item.id),
                        }));

                        // Prepend to first page
                        cleaned[0] = {
                              ...cleaned[0],
                              data: [item, ...cleaned[0].data],
                        };
                        return { ...prev, pages: cleaned };
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

      const removeConversation = useCallback((conversationId: string) => {
            queryClient.setQueryData<InfiniteData<ConversationsPage, string | undefined>>(
                  conversationsQueryKey,
                  (prev) => {
                        if (!prev) return prev;

                        const nextPages = prev.pages.map((page) => ({
                              ...page,
                              data: page.data.filter((c) => c.id !== conversationId),
                        }));

                        return { ...prev, pages: nextPages };
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

            onGroupYouWereRemoved: (data) => {
                  api.warning({
                        message: 'Bạn đã bị xóa khỏi nhóm',
                        placement: 'topRight',
                        duration: 5,
                  });

                  removeConversation(data.conversationId);

                  if (selectedId === data.conversationId) {
                        setSelectedId(null);
                  }
            },

            onGroupMemberJoined: () => {
                  api.info({
                        message: 'Có thành viên mới tham gia nhóm',
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

                  removeConversation(data.conversationId);

                  if (selectedId === data.conversationId) {
                        setSelectedId(null);
                  }
            },
      });

      // ============================================================================
      // 2. MESSAGES LIST (Infinite Scroll - Backward/Reverse)
      // ============================================================================

      const {
            messages,
            query: messagesQuery,
            isInitialLoad,
            isAtBottom,
            newMessageCount,
            highlightedMessageId,
            clearNewMessageCount,
            scrollToBottom,
            loadOlder,
            loadNewer,
            jumpToMessage,
            returnToLatest,
            isJumpedAway,
            queryKey: messagesQueryKey,
            isJumpingRef,
            jumpBufferRef,
            isFetchingNewerRef,
      } = useChatMessages({
            conversationId: selectedId,
            limit: 50,
            messagesContainerRef,
      });

      useEffect(() => {
            if (!isSocketConnected) return;
            void queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
            if (selectedId) {
                  void queryClient.invalidateQueries({ queryKey: messagesQueryKey });
            }
      }, [isSocketConnected, connectionNonce, queryClient, conversationsQueryKey, selectedId, messagesQueryKey]);

      const {
            isConnected: isMsgSocketConnected,
            emitSendMessage,
            emitMarkAsSeen,
            emitTypingStart,
            emitTypingStop,
      } = useMessageSocket({
            conversationId: selectedId,
            messagesQueryKey,
            isJumpingRef,
            jumpBufferRef,
            onTypingStatus: (payload) => {
                  const myId = currentUserId;
                  if (myId && payload.userId === myId) return;
                  setTypingUserIds((prev) => {
                        if (payload.isTyping) {
                              if (prev.includes(payload.userId)) return prev;
                              return [...prev, payload.userId];
                        }
                        return prev.filter((id) => id !== payload.userId);
                  });
            },
      });

      const typingText = typingUserIds.length > 0 ? 'Đang nhập...' : null;

      const resetConversationUnread = useCallback((conversationId: string, lastReadMessageId?: string) => {
            queryClient.setQueryData<InfiniteData<ConversationsPage, string | undefined>>(
                  conversationsQueryKey,
                  (prev) => {
                        if (!prev) return prev;
                        const pages = prev.pages.map((page) => ({
                              ...page,
                              data: page.data.map((c) => {
                                    if (c.id !== conversationId) return c;
                                    return {
                                          ...c,
                                          unreadCount: 0,
                                          unread: 0,
                                          ...(lastReadMessageId ? { lastReadMessageId } : {}),
                                    };
                              }),
                        }));
                        return { ...prev, pages };
                  });
      }, [queryClient, conversationsQueryKey]);

      useEffect(() => {
            if (!selectedId) return;
            if (!isMsgSocketConnected) return;
            if (messages.length === 0) return;

            const latestMessageId = messages[messages.length - 1]?.id;
            resetConversationUnread(selectedId, latestMessageId);

            const messageIds = messages
                  .filter((m) => (m.senderId ?? null) !== (currentUserId ?? null))
                  .slice(-50)
                  .map((m) => m.id);

            if (messageIds.length === 0) return;

            emitMarkAsSeen({
                  conversationId: selectedId,
                  messageIds,
            });
      }, [selectedId, isMsgSocketConnected, messages, currentUserId, emitMarkAsSeen, resetConversationUnread]);

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
                  metadata: { sendStatus: 'SENDING' },
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

            if (isMsgSocketConnected) {
                  emitSendMessage({
                        conversationId: selectedId,
                        clientMessageId,
                        type: 'TEXT',
                        content: trimmed,
                  }, (ack) => {
                        if (!ack || !('error' in ack) || !ack.error) return;
                        queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey, (prev) => {
                              if (!prev) return prev;
                              const pages = prev.pages.map((p) => ({
                                    ...p,
                                    data: p.data.map((m) => {
                                          if (m.clientMessageId !== clientMessageId) return m;
                                          return {
                                                ...m,
                                                metadata: { ...(m.metadata ?? {}), sendStatus: 'FAILED', sendError: ack.error },
                                          };
                                    }),
                              }));
                              return { ...prev, pages };
                        });
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
                  queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey, (prev) => {
                        if (!prev) return prev;
                        const pages = prev.pages.map((p) => ({
                              ...p,
                              data: p.data.map((m) => {
                                    if (m.clientMessageId !== clientMessageId) return m;
                                    return {
                                          ...m,
                                          metadata: { ...(m.metadata ?? {}), sendStatus: 'FAILED', sendError: 'Send failed' },
                                    };
                              }),
                        }));
                        return { ...prev, pages };
                  });
                  api.error({ message: 'Gửi tin nhắn thất bại', placement: 'topRight' });
            }
      }, [selectedId, currentUserId, queryClient, messagesQueryKey, isMsgSocketConnected, emitSendMessage, api]);

      const handleRetryMessage = useCallback((msg: MessageListItem) => {
            if (!selectedId) return;
            if (!isMsgSocketConnected) return;
            if (!msg.clientMessageId) return;

            queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey, (prev) => {
                  if (!prev) return prev;
                  const pages = prev.pages.map((p) => ({
                        ...p,
                        data: p.data.map((m) => {
                              if (m.clientMessageId !== msg.clientMessageId) return m;
                              return {
                                    ...m,
                                    metadata: { ...(m.metadata ?? {}), sendStatus: 'SENDING' },
                              };
                        }),
                  }));
                  return { ...prev, pages };
            });

            emitSendMessage({
                  conversationId: selectedId,
                  clientMessageId: msg.clientMessageId,
                  type: msg.type,
                  content: msg.content,
            }, (ack) => {
                  if (!ack || !('error' in ack) || !ack.error) return;
                  queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey, (prev) => {
                        if (!prev) return prev;
                        const pages = prev.pages.map((p) => ({
                              ...p,
                              data: p.data.map((m) => {
                                    if (m.clientMessageId !== msg.clientMessageId) return m;
                                    return {
                                          ...m,
                                          metadata: { ...(m.metadata ?? {}), sendStatus: 'FAILED', sendError: ack.error },
                                    };
                              }),
                        }));
                        return { ...prev, pages };
                  });
            });
      }, [selectedId, isMsgSocketConnected, queryClient, messagesQueryKey, emitSendMessage]);

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

      const [isLoadingNewer, setIsLoadingNewer] = useState(false);

      // Use ref to always access latest loadNewer without re-creating callback
      const loadNewerRef = useRef(loadNewer);
      loadNewerRef.current = loadNewer;

      const handleNewerInView = useCallback((inView: boolean) => {
            if (!inView) return;
            if (!isJumpedAway) return;
            if (isFetchingNewerRef.current) return;
            setIsLoadingNewer(true);
            void loadNewerRef.current().finally(() => setIsLoadingNewer(false));
      }, [isJumpedAway, isFetchingNewerRef]);

      const { ref: msgLoadNewerRef } = useInView({
            threshold: 0.1,
            rootMargin: '200px',
            onChange: handleNewerInView,
      });

      const handleSelectConversation = useCallback((id: string) => {
            if (id === selectedId) return;
            setSelectedId(id);
            setTypingUserIds([]);
      }, [selectedId]);

      const fetchedSearchConvIds = useRef(new Set<string>());
      const [searchConvMap, setSearchConvMap] = useState<Record<string, ChatConversation>>({});

      // Ref to always access latest conversations without stale closures
      const conversationsRef = useRef(conversations);
      conversationsRef.current = conversations;

      const ensureConversationLoaded = useCallback(async (id: string): Promise<void> => {
            // Already in the paginated list → no fetch needed
            if (conversationsRef.current.some((c) => c.id === id)) return;
            // Already fetched before (might still be prepending) → skip duplicate fetch
            if (fetchedSearchConvIds.current.has(id)) return;

            fetchedSearchConvIds.current.add(id);
            try {
                  const conv = await conversationService.getConversationById(id);
                  prependConversation(conv);
                  // Also store in local state as fallback (setQueryData on infinite queries
                  // may not always trigger useInfiniteQuery re-render)
                  setSearchConvMap((prev) => ({ ...prev, [id]: conv }));
            } catch (error) {
                  console.error(`[ensureConversationLoaded] Failed to load conversation ${id}:`, error);
                  fetchedSearchConvIds.current.delete(id); // Allow retry on next attempt
            }
      }, [prependConversation]);

      // Trigger fetch when selectedId changes and conversation isn't loaded yet
      useEffect(() => {
            if (!selectedId) return;
            void ensureConversationLoaded(selectedId);
      }, [selectedId, ensureConversationLoaded]);

      const selectedConversation = (
            conversations.find((c) => c.id === selectedId)
            ?? (selectedId ? searchConvMap[selectedId] : undefined)
      ) as ChatConversation | undefined;

      return (
            <>
                  <div className="h-full w-full flex overflow-hidden bg-gray-50">
                        {contextHolder}
                        {isGlobalSearchOpen ? (
                              <SearchPanel
                                    onClose={() => setIsGlobalSearchOpen(false)}
                                    onNavigateToConversation={async (id) => {
                                          handleSelectConversation(id);
                                          setIsGlobalSearchOpen(false);
                                          await ensureConversationLoaded(id);
                                    }}
                                    onNavigateToConversationSearch={async (convId, searchKeyword) => {
                                          handleSelectConversation(convId);
                                          setIsGlobalSearchOpen(false);
                                          await ensureConversationLoaded(convId);
                                          setRightSidebar('search');
                                          setPrefillSearchKeyword(searchKeyword);
                                    }}
                              />
                        ) : (
                              <ConversationSidebar
                                    conversations={conversations}
                                    selectedId={selectedId}
                                    onSelect={handleSelectConversation}
                                    loadMoreRef={convLoadMoreRef}
                                    hasMore={convHasMore}
                                    isLoading={isLoadingConv}
                                    onSearchClick={() => {
                                          setIsGlobalSearchOpen(true);
                                          setRightSidebar('none');
                                    }}
                                    onFriendSearchClick={() => setIsFriendSearchOpen(true)}
                              />
                        )}

                        <div className="flex-1 flex flex-col h-full overflow-hidden">
                              {selectedConversation ? (
                                    <>
                                          <ChatHeader
                                                conversationName={selectedConversation.name || 'Chat'}
                                                avatarUrl={selectedConversation.avatar ?? null}
                                                isDirect={selectedConversation.type === 'DIRECT'}
                                                isOnline={selectedConversation.type === 'DIRECT' ? selectedConversation.isOnline ?? false : false}
                                                lastSeenAt={selectedConversation.type === 'DIRECT' ? selectedConversation.lastSeenAt ?? null : null}
                                                typingText={typingText}
                                                onToggleSearch={() => {
                                                      setRightSidebar(prev => prev === 'search' ? 'none' : 'search');
                                                      setIsGlobalSearchOpen(false);
                                                }}
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
                                                isAtBottom={isAtBottom}
                                                isJumpedAway={isJumpedAway}
                                                newMessageCount={newMessageCount}
                                                highlightedMessageId={highlightedMessageId}
                                                onScrollToBottom={() => {
                                                      clearNewMessageCount();
                                                      scrollToBottom();
                                                }}
                                                onReturnToLatest={returnToLatest}
                                                msgLoadNewerRef={msgLoadNewerRef}
                                                isLoadingNewer={isLoadingNewer}
                                                onRetry={(m) => handleRetryMessage(m)}
                                          />

                                          <ChatInput
                                                conversationId={selectedId}
                                                onSend={handleSendText}
                                                onTypingChange={(isTyping) => {
                                                      if (!selectedId) return;
                                                      if (!isMsgSocketConnected) return;
                                                      if (isTyping) {
                                                            emitTypingStart({ conversationId: selectedId });
                                                            return;
                                                      }
                                                      emitTypingStop({ conversationId: selectedId });
                                                }}
                                          />
                                    </>
                              ) : selectedId ? (
                                    <div className="flex-1 flex items-center justify-center text-gray-400">
                                          <div className="flex flex-col items-center gap-2">
                                                <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                                                <span className="text-sm">Đang tải cuộc trò chuyện...</span>
                                          </div>
                                    </div>
                              ) : (
                                    <div className="flex-1 flex items-center justify-center text-gray-400">
                                          Chọn một cuộc trò chuyện để bắt đầu
                                    </div>
                              )}
                        </div>

                        {rightSidebar === 'search' && selectedId && (
                              <ChatSearchSidebar
                                    conversationId={selectedId}
                                    initialKeyword={prefillSearchKeyword}
                                    onClose={() => {
                                          setRightSidebar('none');
                                          setPrefillSearchKeyword(undefined);
                                    }}
                                    onNavigateToMessage={(msgId) => {
                                          if (msgId) void jumpToMessage(msgId);
                                    }}
                              />
                        )}
                        {rightSidebar === 'info' && <ChatInfoSidebar onClose={() => setRightSidebar('none')} />}
                  </div>

                  <FriendshipSearchModal
                        open={isFriendSearchOpen}
                        onClose={() => setIsFriendSearchOpen(false)}
                        onNavigateToConversation={async (id) => {
                              handleSelectConversation(id);
                              setIsGlobalSearchOpen(false);
                              await ensureConversationLoaded(id);
                        }}
                  />
            </>
      );
}