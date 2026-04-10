// src/features/chat/index.tsx
//
// Thin composition shell — all business logic lives in extracted hooks.
// This component wires hooks together and renders the layout.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { notification } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { env } from '@/config/env';
import { SocketEvents } from '@/constants/socket-events';

// ── Feature-internal components ──────────────────────────────────────────
import { ConversationSidebar } from './components/conversation-sidebar';
import { ChatHeader } from './components/chat-header';
import { ChatInput } from './components/chat-input';
import { CloseOutlined } from '@ant-design/icons';
import { ChatSearchSidebar } from './components/chat-search-sidebar';
import { ChatInfoSidebar } from './components/chat-info-sidebar';
import { ChatContent } from './components/chat-content';
import { ReplyPreviewBar } from './components/reply-preview-bar';
import { PinnedMessagesBanner } from './components/pinned-messages-banner';
import { MediaBrowserPanel } from './components/media-browser-panel';
import { ActiveGroupCallBanner } from './components/ActiveGroupCallBanner';
import { ChatAiSidebar } from './components/chat-ai-sidebar.tsx';

// ── Cross-feature components (rendered by page-level host) ───────────────
import { FriendshipSearchModal } from '@/features/contacts';
import { CreateGroupModal } from '@/features/conversation/components/create-group-modal/create-group-modal';
import { useCreateGroupStore } from '@/features/conversation';
import { SearchPanel } from '@/features/search/components/SearchPanel';
import { useReminders, CreateReminderModal } from '@/features/reminder';

// ── Cross-feature hooks ──────────────────────────────────────────────────
import { useConversationListRealtime, usePinConversation, usePinMessage, useArchivedConversationsList, useMuteConversation, useArchiveConversation } from '@/features/conversation';
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
import { messageService } from './api/message.api';
import { applyMessageDeletedForMeToCache } from './utils/message-cache-helpers';

// ── Call feature ─────────────────────────────────────────────────────────
import { getActiveCall } from '@/features/call/api/call.api';
import { useCallStore } from '@/features/call/stores/call.store';

// ── Store ────────────────────────────────────────────────────────────────
import { useChatStore } from './stores/chat.store';
import type { MediaBrowserTab } from './stores/chat.store';
import type { ChatMessage, ConversationFilterTab } from './types';

const isUnifiedAiStreamEnabled = env.AI_UNIFIED_STREAM_ENABLED;

type AiResponseType = 'ask' | 'agent' | 'summary';

function resolveResponseType(data: { responseType?: unknown; type?: unknown }, fallback: AiResponseType): AiResponseType {
      if (data.responseType === 'ask' || data.responseType === 'agent' || data.responseType === 'summary') {
            return data.responseType;
      }

      if (data.type === 'ask' || data.type === 'agent' || data.type === 'summary') {
            return data.type;
      }

      return fallback;
}

interface ReminderTarget {
      conversationId: string;
      messageId: string;
      content: string;
}

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
      const setAiSummaryStartMessageId = useChatStore((s) => s.setAiSummaryStartMessageId);
      const isGlobalSearchOpen = useChatStore((s) => s.isGlobalSearchOpen);
      const setIsGlobalSearchOpen = useChatStore((s) => s.setIsGlobalSearchOpen);
      const isFriendSearchOpen = useChatStore((s) => s.isFriendSearchOpen);
      const setIsFriendSearchOpen = useChatStore((s) => s.setIsFriendSearchOpen);
      const prefillSearchKeyword = useChatStore((s) => s.prefillSearchKeyword);
      const setPrefillSearchKeyword = useChatStore((s) => s.setPrefillSearchKeyword);
      const mediaBrowserTab = useChatStore((s) => s.mediaBrowserTab);
      const setMediaBrowserTab = useChatStore((s) => s.setMediaBrowserTab);
      const replyTarget = useChatStore((s) => s.replyTarget);
      const setReplyTarget = useChatStore((s) => s.setReplyTarget);
      const startAiRequest = useChatStore((s) => s.startAiRequest);
      const updateAiRequestProgress = useChatStore((s) => s.updateAiRequestProgress);
      const appendAiRequestDelta = useChatStore((s) => s.appendAiRequestDelta);
      const appendAiRequestThoughtDelta = useChatStore((s) => s.appendAiRequestThoughtDelta);
      const completeAiRequest = useChatStore((s) => s.completeAiRequest);
      const failAiRequest = useChatStore((s) => s.failAiRequest);
      const { socket } = useSocket();

      // ── "Xem tất cả" handler (info sidebar → media browser panel) ─────────
      const handleOpenMediaBrowser = useCallback(
            (tab: MediaBrowserTab) => {
                  setMediaBrowserTab(tab);
                  setRightSidebar('media-browser');
            },
            [setMediaBrowserTab, setRightSidebar],
      );

      // ── Reminder state ──────────────────────────────────────────────────────────
      const [reminderTarget, setReminderTarget] = useState<ReminderTarget | null>(null);
      const { createReminder, isCreating: isReminderCreating } = useReminders();

      // ── AI Summary Trigger ──────────────────────────────────────────────────
      const [aiSummaryTrigger, setAiSummaryTrigger] = useState<{count: number; startMessageId: string | undefined} | null>(null);

      // ── Reply handler ────────────────────────────────────────────────────
      const handleReply = (msg: ChatMessage) => {
            setReplyTarget({
                  messageId: msg.id,
                  senderName:
                        msg.sender?.resolvedDisplayName ??
                        msg.sender?.displayName ??
                        'Người dùng',
                  content: msg.content,
                  type: msg.type,
                  mediaAttachments: msg.mediaAttachments?.map((a) => ({
                        mediaType: a.mediaType,
                        originalName: a.originalName,
                  })),
            });
      };

      // ── Reminder handler ─────────────────────────────────────────────────
      const handleSetReminder = () => {
            if (!selectedId) return;
            setReminderTarget({
                  conversationId: selectedId,
                  messageId: '',
                  content: '',
            });
      };

      // ── Hook: selection / URL sync ───────────────────────────────────────
      const { selectedId, setSelectedId, handleSelectConversation } = useChatSelection();

      // ── Tab state for conversation list ──────────────────────────────────
      const [activeTab, setActiveTab] = useState<ConversationFilterTab>('all');

      // ── Clear reply target when switching conversations ──────────────────
      useEffect(() => {
            setReplyTarget(null);
      }, [selectedId, setReplyTarget]);

      // ── AI Socket Listeners ─────────────────────────────────────────────
      useEffect(() => {
            if (!socket) return;

            const resolveRequestId = (conversationId?: string, requestId?: string) => {
                  if (requestId) return requestId;
                  if (!conversationId) return undefined;

                  const conv = useChatStore.getState().aiConversations[conversationId];
                  return conv?.activeRequestId ?? undefined;
            };

            const handleStarted = (data: {
                  requestId?: string;
                  conversationId?: string;
                  type?: string;
                  responseType?: string;
                  sessionId?: string;
                  message?: string;
            }) => {
                  if (!data.requestId || !data.conversationId) return;

                  startAiRequest({
                        conversationId: data.conversationId,
                        requestId: data.requestId,
                        responseType: resolveResponseType(data, 'ask'),
                        prompt: data.message || 'Đang xử lý yêu cầu AI',
                        sessionId: data.sessionId,
                  });
            };

            const handleProgress = (data: {
                  requestId?: string;
                  conversationId?: string;
                  step?: string;
                  message?: string;
                  percent?: number;
                  sessionId?: string;
            }) => {
                  if (!data.requestId || !data.conversationId || !data.step) return;

                  updateAiRequestProgress({
                        conversationId: data.conversationId,
                        requestId: data.requestId,
                        sessionId: data.sessionId,
                        progress: {
                              step: data.step,
                              message: data.message,
                              percent: data.percent,
                        },
                  });
            };

            const handleThought = (data: {
                  requestId?: string;
                  conversationId?: string;
                  thoughtDelta?: string;
                  sessionId?: string;
            }) => {
                  if (!data.requestId || !data.conversationId || !data.thoughtDelta) return;
                  appendAiRequestThoughtDelta({
                        conversationId: data.conversationId,
                        requestId: data.requestId,
                        thoughtDelta: data.thoughtDelta,
                  });
            };

            const handleDelta = (data: {
                  requestId?: string;
                  conversationId?: string;
                  contentDelta?: string;
                  thoughtDelta?: string;
                  content?: string;
                  text?: string;
                  step?: string;
                  message?: string;
                  percent?: number;
                  responseType?: string;
                  sessionId?: string;
            }) => {
                  if (!data.requestId || !data.conversationId) return;

                  // Handle progress updates (if any)
                  if (data.step) {
                        updateAiRequestProgress({
                              conversationId: data.conversationId,
                              requestId: data.requestId,
                              sessionId: data.sessionId,
                              progress: {
                                    step: data.step,
                                    message: data.message,
                                    percent: data.percent,
                              },
                        });
                  }

                  // Handle thought updates
                  if (data.thoughtDelta) {
                        appendAiRequestThoughtDelta({
                              conversationId: data.conversationId,
                              requestId: data.requestId,
                              thoughtDelta: data.thoughtDelta,
                        });
                  }

                  // Handle content updates
                  const contentDelta = data.contentDelta || data.content || data.text;
                  if (contentDelta) {
                        appendAiRequestDelta({
                              conversationId: data.conversationId,
                              requestId: data.requestId,
                              contentDelta,
                              sessionId: data.sessionId,
                        });
                  }
            };

            const handleCompleted = (data: {
                  requestId?: string;
                  conversationId?: string;
                  content?: string;
                  responseType?: string;
                  sessionId?: string;
                  type?: string;
            }) => {
                  const requestId = resolveRequestId(data.conversationId, data.requestId);
                  if (!requestId || !data.conversationId) return;

                  completeAiRequest({
                        conversationId: data.conversationId,
                        requestId,
                        content: data.content || '',
                        sessionId: data.sessionId,
                        responseType: resolveResponseType(data, 'summary'),
                  });
            };

            const handleError = (data: {
                  requestId?: string;
                  conversationId?: string;
                  code?: string;
                  message?: string;
                  retriable?: boolean;
                  sessionId?: string;
            }) => {
                  const requestId = resolveRequestId(data.conversationId, data.requestId);
                  if (!requestId || !data.conversationId) return;

                  failAiRequest({
                        conversationId: data.conversationId,
                        requestId,
                        sessionId: data.sessionId,
                        error: {
                              code: data.code || 'AI_UNIFIED_ERROR',
                              message: data.message || 'Đã có lỗi xảy ra trong quá trình xử lý.',
                              retriable: Boolean(data.retriable),
                        },
                  });

                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  notification.error({
                        message: 'Lỗi trợ lý AI',
                        description: data.message || 'Đã có lỗi xảy ra trong quá trình xử lý.',
                  });
            };

            socket.on(SocketEvents.AI_RESPONSE_STARTED, handleStarted);
            socket.on(SocketEvents.AI_RESPONSE_PROGRESS, handleProgress);
            socket.on(SocketEvents.AI_RESPONSE_THOUGHT, handleThought);
            socket.on(SocketEvents.AI_RESPONSE_DELTA, handleDelta);
            socket.on(SocketEvents.AI_RESPONSE_COMPLETED, handleCompleted);
            socket.on(SocketEvents.AI_RESPONSE_ERROR, handleError);

            if (!isUnifiedAiStreamEnabled) {
                  socket.on(SocketEvents.AI_STREAM_START, handleStarted);
                  socket.on(SocketEvents.AI_STREAM_CHUNK, handleDelta);
                  socket.on(SocketEvents.AI_STREAM_DONE, handleCompleted);
                  socket.on(SocketEvents.AI_STREAM_ERROR, handleError);
                  socket.on(SocketEvents.AI_SUMMARY, handleCompleted);
            }

            return () => {
                  socket.off(SocketEvents.AI_RESPONSE_STARTED, handleStarted);
                  socket.off(SocketEvents.AI_RESPONSE_PROGRESS, handleProgress);
                  socket.off(SocketEvents.AI_RESPONSE_THOUGHT, handleThought);
                  socket.off(SocketEvents.AI_RESPONSE_DELTA, handleDelta);
                  socket.off(SocketEvents.AI_RESPONSE_COMPLETED, handleCompleted);
                  socket.off(SocketEvents.AI_RESPONSE_ERROR, handleError);

                  if (!isUnifiedAiStreamEnabled) {
                        socket.off(SocketEvents.AI_STREAM_START, handleStarted);
                        socket.off(SocketEvents.AI_STREAM_CHUNK, handleDelta);
                        socket.off(SocketEvents.AI_STREAM_DONE, handleCompleted);
                        socket.off(SocketEvents.AI_STREAM_ERROR, handleError);
                        socket.off(SocketEvents.AI_SUMMARY, handleCompleted);
                  }
            };
      }, [socket, startAiRequest, updateAiRequestProgress, appendAiRequestThoughtDelta, appendAiRequestDelta, completeAiRequest, failAiRequest]);


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
      } = useConversationListMutations(activeTab === 'unread');

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
            currentUserId,
      });

      // ── Hook: pin conversation ───────────────────────────────────────────
      const { togglePin } = usePinConversation();

      // ── Hook: mute / archive conversation ─────────────────────────────────
      const { toggleMute } = useMuteConversation();
      const { toggleArchive, isArchiving } = useArchiveConversation();

      // ── Hook: archived conversations ("Lưu trữ" tab) ──────────────────────
      const archivedQuery = useArchivedConversationsList();
      const archivedConversations = (archivedQuery.data?.pages ?? []).flatMap((p) => p.data);
      const archivedHasMore = archivedQuery.hasNextPage;
      const archivedIsLoading = archivedQuery.isLoading || archivedQuery.isFetchingNextPage;
      const { ref: archivedLoadMoreRef, inView: archivedInView } = useInView({
            threshold: 0.1,
            rootMargin: '100px',
      });

      useEffect(() => {
            if (!archivedInView || !archivedQuery.hasNextPage || archivedQuery.isFetchingNextPage) return;
            void archivedQuery.fetchNextPage();
      }, [archivedInView, archivedQuery]);

      // ── Archive wrapper: deselect if archiving active conversation ────────
      const handleToggleArchive = useCallback(
            (conversationId: string, currentlyArchived: boolean) => {
                  toggleArchive(conversationId, currentlyArchived);
                  // If archiving the currently selected conversation, deselect it
                  if (!currentlyArchived && conversationId === selectedId) {
                        setSelectedId(null);
                        setRightSidebar('none');
                  }
            },
            [toggleArchive, selectedId, setSelectedId, setRightSidebar],
      );

      // ── Hook: pin message ────────────────────────────────────────────────
      const {
            pinnedMessages,
            pinMessage,
            unpinMessage,
      } = usePinMessage(selectedId);

      const pinnedMessageIds = useMemo(
            () => new Set((pinnedMessages ?? []).map((m) => m.id)),
            [pinnedMessages],
      );

      // ── Phase 3: Active call sync on conversation switch ────────────────
      const { setActiveGroupCall, callStatus } = useCallStore();

      useEffect(() => {
            if (!selectedId || !selectedId.includes(':')) { // Basic check if it's a UUID or custom ID (groups usually have UUIDs)
                  // Actually safer to check selectedConversation?.type
            }
            if (selectedId && selectedId.length > 0) {
                  // Logic below handles type check
            }
      }, [selectedId]);

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

      // ── Bug 1 fix: factory to derive the correct messages query key for any conversationId.
      const buildMessagesQueryKey = useCallback(
            (cid: string) => ['messages', { conversationId: cid, limit: 50 }] as const,
            [],
      );

      // ── Hook: message socket (single call with typing wired in) ──────────
      const {
            isConnected: isMsgSocketConnected,
            emitSendMessage,
            emitRecallMessage,
            emitMarkAsSeen,
            emitTypingStart,
            emitTypingStop,
      } = useMessageSocket({
            conversationId: selectedId,
            messagesQueryKey,
            isJumpingRef,
            jumpBufferRef,
            onTypingStatus,
            buildMessagesQueryKey,
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

      const handleRecallMessage = useCallback(async (msg: ChatMessage) => {
            if (!selectedId) return;
            if (msg.senderSide !== 'me') return;

            try {
                  if (isMsgSocketConnected) {
                        await emitRecallMessage({
                              conversationId: selectedId,
                              messageId: msg.id,
                        });
                        return;
                  }

                  await messageService.recallMessage(msg.id);
                  await queryClient.invalidateQueries({ queryKey: messagesQueryKey });
            } catch (error) {
                  const message = error instanceof Error
                        ? error.message
                        : 'Không thể thu hồi tin nhắn';
                  notification.error({
                        message: 'Thu hồi thất bại',
                        description: message,
                  });
            }
      }, [selectedId, isMsgSocketConnected, emitRecallMessage, queryClient, messagesQueryKey]);

      const handleDeleteForMeMessage = useCallback(async (msg: ChatMessage) => {
            if (!selectedId || !currentUserId) return;

            const previousMessages = queryClient.getQueryData(messagesQueryKey);
            const optimisticPayload = {
                  conversationId: selectedId,
                  messageId: msg.id,
                  userId: currentUserId,
                  deletedAt: new Date().toISOString(),
            };

            applyMessageDeletedForMeToCache(queryClient, messagesQueryKey, optimisticPayload);

            try {
                  await messageService.deleteMessageForMe(msg.id);
                  await queryClient.invalidateQueries({ queryKey: ['conversations'] });
            } catch (error) {
                  queryClient.setQueryData(messagesQueryKey, previousMessages);
                  const message = error instanceof Error
                        ? error.message
                        : 'Không thể xóa tin nhắn ở phía bạn';
                  notification.error({
                        message: 'Xóa tin nhắn thất bại',
                        description: message,
                  });
            }
      }, [selectedId, currentUserId, queryClient, messagesQueryKey]);

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
                        const isPending = !DONE_STATUSES.has(a.processingStatus);
                        const isReadyWithoutThumb =
                              a.processingStatus === 'READY' &&
                              !a.thumbnailUrl &&
                              (a.mediaType === 'VIDEO' || a.mediaType === 'IMAGE');
                        if (isPending || isReadyWithoutThumb) {
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

      // Capture initial unread state before useMarkAsSeen wipes it
      useEffect(() => {
            if (selectedId && selectedConversation) {
                  // Only run this ONCE per selectedId change. Data is from cache before it gets cleared.
                  if ((selectedConversation.unreadCount ?? 0) > 50) {
                        setAiSummaryTrigger({
                              count: selectedConversation.unreadCount!,
                              startMessageId: selectedConversation.lastReadMessageId ?? undefined,
                        });
                  } else {
                        setAiSummaryTrigger(null);
                  }
            } else {
                  setAiSummaryTrigger(null);
            }
      // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [selectedId]); // Intentional: Only run precisely when selectedId changes

      // Phase 3: Sync active call on conversation change
      useEffect(() => {
            if (selectedId && selectedConversation?.type === 'GROUP') {
                  const sync = async () => {
                        try {
                              // Phase 9: Add a small delay to allow backend to process hangup event
                              // This prevents a race condition where sync() hits backend before user is removed from session
                              if (callStatus === 'IDLE') {
                                    await new Promise(resolve => setTimeout(resolve, 300));
                              }
                              
                              const res = await getActiveCall(selectedId);
                              console.log("res active", res);
                              // Phase 6 & 9: res is now already unwrapped by call.api.ts
                              setActiveGroupCall(selectedId, res.active, res.dailyRoomUrl);
                        } catch (e) {
                              console.warn('Failed to sync active call:', e);
                        }
                  };
                  void sync();
            }
      }, [selectedId, selectedConversation?.type, setActiveGroupCall, callStatus]);

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
                                    activeTab={activeTab}
                                    onTabChange={setActiveTab}
                                    onSearchClick={() => {
                                          setIsGlobalSearchOpen(true);
                                          setRightSidebar('none');
                                    }}
                                    onFriendSearchClick={() => setIsFriendSearchOpen(true)}
                                    onCreateGroupClick={() => useCreateGroupStore.getState().open()}
                                    onTogglePin={togglePin}
                                    archivedConversations={archivedConversations}
                                    archivedLoadMoreRef={archivedLoadMoreRef}
                                    archivedHasMore={archivedHasMore}
                                    archivedIsLoading={archivedIsLoading}
                                    onToggleMute={toggleMute}
                                    onToggleArchive={handleToggleArchive}
                              />
                        )}

                        <div className="flex-1 flex flex-col h-full overflow-hidden">
                              {selectedConversation ? (
                                    <>
                                          <ChatHeader
                                                conversationId={selectedConversation.id}
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
                                                onToggleAiSummary={() => setRightSidebar((prev) => prev === 'ai-assistant' ? 'none' : 'ai-assistant')}
                                          />

                                          <ActiveGroupCallBanner
                                                conversationId={selectedConversation.id}
                                                displayName={selectedConversation.name || 'Hội thoại'}
                                                avatarUrl={selectedConversation.avatar ?? null}
                                          />

                                          {aiSummaryTrigger && (
                                                <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2.5 flex items-center justify-between text-sm shadow-md shrink-0">
                                                      <span className="font-medium">Bạn có {aiSummaryTrigger.count} tin nhắn chưa đọc.</span>
                                                      <div className="flex gap-2 items-center">
                                                            <button
                                                                  className="bg-white text-blue-600 px-3 py-1 rounded-full font-medium hover:bg-blue-50 transition-colors shadow-sm text-xs flex items-center gap-1 cursor-pointer"
                                                                  onClick={() => {
                                                                        setRightSidebar('ai-summary');
                                                                        if (aiSummaryTrigger.startMessageId) {
                                                                              setAiSummaryStartMessageId(aiSummaryTrigger.startMessageId);
                                                                        }
                                                                        setAiSummaryTrigger(null);
                                                                  }}
                                                            >
                                                                  <span role="img" aria-label="ai">✨</span> Tóm tắt AI
                                                            </button>
                                                            <button 
                                                                  className="w-6 h-6 flex items-center justify-center hover:bg-blue-700/50 rounded-full transition-colors cursor-pointer" 
                                                                  onClick={() => setAiSummaryTrigger(null)}
                                                            >
                                                                  <CloseOutlined className="text-xs" />
                                                            </button>
                                                      </div>
                                                </div>
                                          )}

                                          <PinnedMessagesBanner
                                                pinnedMessages={pinnedMessages ?? []}
                                                onJumpToMessage={(msgId) => void jumpToMessage(msgId)}
                                                onUnpin={unpinMessage}
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
                                                onReply={handleReply}
                                                onJumpToMessage={(msgId) => void jumpToMessage(msgId)}
                                                pinnedMessageIds={pinnedMessageIds}
                                                onPinMessage={pinMessage}
                                                onUnpinMessage={unpinMessage}
                                                onRecallMessage={handleRecallMessage}
                                                onDeleteForMeMessage={handleDeleteForMeMessage}
                                          />

                                          {replyTarget && (
                                                <ReplyPreviewBar
                                                      target={replyTarget}
                                                      onCancel={() => setReplyTarget(null)}
                                                />
                                          )}

                                          <ChatInput
                                                conversationId={selectedId}
                                                onSend={handleSendMessage}
                                                onTypingChange={handleTypingChange}
                                                onSetReminder={handleSetReminder}
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
                                    onTogglePin={togglePin}
                                    onToggleMute={toggleMute}
                                    onToggleArchive={handleToggleArchive}
                                    isArchiving={isArchiving}
                                    onClose={() => setRightSidebar('none')}
                                    onOpenMediaBrowser={handleOpenMediaBrowser}
                                    onLeaveGroup={() => {
                                          if (selectedId) removeConversation(selectedId);
                                          setSelectedId(null);
                                          setRightSidebar('none');
                                    }}
                              />
                        )}
                        {rightSidebar === 'media-browser' && selectedId && (
                              <MediaBrowserPanel
                                    conversationId={selectedId}
                                    initialTab={mediaBrowserTab}
                                    onClose={() => setRightSidebar('none')}
                              />
                        )}
                        {(rightSidebar === 'ai-summary' || rightSidebar === 'ai-assistant') && selectedId && (
                              <ChatAiSidebar
                                    conversationId={selectedId}
                                    onClose={() => setRightSidebar('none')}
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

                  <CreateReminderModal
                        open={!!reminderTarget}
                        onClose={() => setReminderTarget(null)}
                        onSubmit={createReminder}
                        conversationId={reminderTarget?.conversationId}
                        messageId={reminderTarget?.messageId || undefined}
                        defaultContent={reminderTarget?.content || undefined}
                        isSubmitting={isReminderCreating}
                  />
            </>
      );
}
