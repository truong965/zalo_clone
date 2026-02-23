// src/features/chat/index.tsx
//
// Thin composition shell — all business logic lives in extracted hooks.
// This component wires hooks together and renders the layout.

import { useState, useEffect, useRef, useMemo } from 'react';
import { notification } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';

// ── Feature-internal components ──────────────────────────────────────────
import { ConversationSidebar } from './components/conversation-sidebar';
import { ChatHeader } from './components/chat-header';
import { ChatInput } from './components/chat-input';
import { ChatSearchSidebar } from './components/chat-search-sidebar';
import { ChatInfoSidebar } from './components/chat-info-sidebar';
import { ChatContent } from './components/chat-content';

// ── Cross-feature components (rendered by page-level host) ───────────────
import { FriendshipSearchModal } from '@/features/contacts';
import { CreateGroupModal, useCreateGroupStore } from '@/features/conversation';
import { SearchPanel } from '@/features/search/components/SearchPanel';

// ── Cross-feature hooks ──────────────────────────────────────────────────
import { useConversationListRealtime } from '@/features/conversation';
import { useAuthStore } from '@/features/auth';
import { useSocket } from '@/hooks/use-socket';

// ── Feature-internal hooks ───────────────────────────────────────────────
import { useChatMessages } from './hooks/use-chat-messages';
import { useMessageSocket } from './hooks/use-message-socket';
import { useMediaProgress } from './hooks/use-media-progress';
import { useChatConversationRealtime } from './hooks/use-chat-conversation-realtime';
import { useChatSelection } from './hooks/use-chat-selection';
import { useSendMessage } from './hooks/use-send-message';
import { useMarkAsSeen } from './hooks/use-mark-as-seen';
import { useTypingIndicator, useHandleTypingChange } from './hooks/use-typing-indicator';
import { useConversationListMutations } from './hooks/use-conversation-list-mutations';
import { useConversationLoader } from './hooks/use-conversation-loader';

// ── Store ────────────────────────────────────────────────────────────────
import { useChatStore } from './stores/chat.store';

export function ChatFeature() {
      const [, contextHolder] = notification.useNotification();
      const queryClient = useQueryClient();
      const currentUserId = useAuthStore((s) => s.user?.id ?? null);
      const { isConnected: isSocketConnected, connectionNonce } = useSocket();

      // ── Refs ─────────────────────────────────────────────────────────────
      const messagesEndRef = useRef<HTMLDivElement>(null);
      const messagesContainerRef = useRef<HTMLDivElement>(null);

      // ── Store selectors ──────────────────────────────────────────────────
      const rightSidebar = useChatStore((s) => s.rightSidebar);
      const setRightSidebar = useChatStore((s) => s.setRightSidebar);
      const isGlobalSearchOpen = useChatStore((s) => s.isGlobalSearchOpen);
      const setIsGlobalSearchOpen = useChatStore((s) => s.setIsGlobalSearchOpen);
      const isFriendSearchOpen = useChatStore((s) => s.isFriendSearchOpen);
      const setIsFriendSearchOpen = useChatStore((s) => s.setIsFriendSearchOpen);
      const prefillSearchKeyword = useChatStore((s) => s.prefillSearchKeyword);
      const setPrefillSearchKeyword = useChatStore((s) => s.setPrefillSearchKeyword);

      // ── Hook: selection / URL sync ───────────────────────────────────────
      const { selectedId, setSelectedId, handleSelectConversation } = useChatSelection();

      // ── Hook: conversation list (query + cache mutations) ────────────────
      const {
            conversations,
            conversationsQueryKey,
            isLoadingConv,
            convHasMore,
            convLoadMoreRef,
            prependConversation,
            updateConversation,
            removeConversation,
      } = useConversationListMutations();

      // ── Realtime: conversation list ──────────────────────────────────────
      useConversationListRealtime({
            conversationsQueryKey,
            selectedConversationId: selectedId,
      });

      useChatConversationRealtime({
            prependConversation,
            updateConversation,
            removeConversation,
            selectedId,
            setSelectedId,
      });

      // ── Hook: messages ───────────────────────────────────────────────────
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

      // ── Invalidate on reconnect ──────────────────────────────────────────
      useEffect(() => {
            if (!isSocketConnected) return;
            void queryClient.invalidateQueries({ queryKey: conversationsQueryKey });
            if (selectedId) {
                  void queryClient.invalidateQueries({ queryKey: messagesQueryKey });
            }
      }, [isSocketConnected, connectionNonce, queryClient, conversationsQueryKey, selectedId, messagesQueryKey]);

      // ── Hook: typing indicator (no socket dependency → safe before useMessageSocket)
      const { typingText, onTypingStatus } = useTypingIndicator({ currentUserId });

      // ── Hook: message socket (single call with typing wired in) ──────────
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
            onTypingStatus,
      });

      // ── Hook: typing change handler (needs socket emitters → after useMessageSocket)
      const { handleTypingChange } = useHandleTypingChange({
            selectedId,
            isMsgSocketConnected,
            emitTypingStart,
            emitTypingStop,
      });

      // ── Hook: send message ───────────────────────────────────────────────
      const { handleSendMessage, handleRetryMessage } = useSendMessage({
            selectedId,
            currentUserId,
            messagesQueryKey,
            isMsgSocketConnected,
            emitSendMessage,
      });

      // ── Hook: mark as seen ───────────────────────────────────────────────
      useMarkAsSeen({
            selectedId,
            currentUserId,
            messages,
            isMsgSocketConnected,
            emitMarkAsSeen,
            conversationsQueryKey,
      });

      // ── Phase 7: Track pending media via WebSocket ───────────────────────
      const pendingMediaIds = useMemo(() => {
            const DONE_STATUSES = new Set(['READY', 'FAILED']);
            const ids: string[] = [];
            for (const msg of messages) {
                  if (!msg.mediaAttachments) continue;
                  for (const a of msg.mediaAttachments) {
                        if (!DONE_STATUSES.has(a.processingStatus)) {
                              ids.push(a.id);
                        }
                  }
            }
            return ids;
      }, [messages]);

      useMediaProgress({ messagesQueryKey, mediaIds: pendingMediaIds });

      // ── Hook: conversation loader (search result / deep link) ────────────
      const { selectedConversation, ensureConversationLoaded } = useConversationLoader({
            selectedId,
            conversations,
            prependConversation,
      });

      // ── Messages infinite scroll (older + newer) ────────────────────────
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
      const loadNewerRef = useRef(loadNewer);
      loadNewerRef.current = loadNewer;

      const handleNewerInView = useMemo(() => {
            return (inView: boolean) => {
                  if (!inView) return;
                  if (!isJumpedAway) return;
                  if (isFetchingNewerRef.current) return;
                  setIsLoadingNewer(true);
                  void loadNewerRef.current().finally(() => setIsLoadingNewer(false));
            };
      }, [isJumpedAway, isFetchingNewerRef]);

      const { ref: msgLoadNewerRef } = useInView({
            threshold: 0.1,
            rootMargin: '200px',
            onChange: handleNewerInView,
      });

      // ════════════════════════════════════════════════════════════════════════
      // RENDER
      // ════════════════════════════════════════════════════════════════════════

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
                                    onCreateGroupClick={() => useCreateGroupStore.getState().open()}
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
                                                otherUserId={selectedConversation.type === 'DIRECT' ? selectedConversation.otherUserId ?? null : null}
                                                onToggleSearch={() => {
                                                      setRightSidebar((prev) => prev === 'search' ? 'none' : 'search');
                                                      setIsGlobalSearchOpen(false);
                                                }}
                                                onToggleInfo={() => setRightSidebar((prev) => prev === 'info' ? 'none' : 'info')}
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
                                                isDirect={selectedConversation.type === 'DIRECT'}
                                          />

                                          <ChatInput
                                                conversationId={selectedId}
                                                onSend={handleSendMessage}
                                                onTypingChange={handleTypingChange}
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
                        {rightSidebar === 'info' && selectedId && currentUserId && (
                              <ChatInfoSidebar
                                    conversationId={selectedId}
                                    currentUserId={currentUserId}
                                    onClose={() => setRightSidebar('none')}
                                    onLeaveGroup={() => {
                                          // Immediately remove from cache + clear selection
                                          // to prevent stale API calls (members, messages, message:seen)
                                          if (selectedId) removeConversation(selectedId);
                                          setSelectedId(null);
                                          setRightSidebar('none');
                                    }}
                              />
                        )}
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

                  <CreateGroupModal
                        onCreated={async (conversationId) => {
                              handleSelectConversation(conversationId);
                              await ensureConversationLoaded(conversationId);
                        }}
                  />
            </>
      );
}
