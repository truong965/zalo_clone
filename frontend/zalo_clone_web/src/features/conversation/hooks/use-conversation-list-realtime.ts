/**
 * Conversation List Realtime Hook
 *
 * Moved from hooks/use-conversation-list-realtime.ts to features/conversation/hooks/
 * Listens for CONVERSATION_LIST_ITEM_UPDATED + FRIEND_ONLINE/OFFLINE socket events
 * and updates the TanStack Query cache accordingly.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/hooks/use-socket';
import { SocketEvents } from '@/constants/socket-events';
import type { ConversationLastMessage } from '@/types/api';
import type { ConversationUI } from '@/types/api';
import { conversationKeys } from './use-conversation-queries';

type ConversationListItemUpdatedPayload = {
      conversationId: string;
      lastMessage: ConversationLastMessage;
      lastMessageAt: string;
      unreadCountDelta: number;
};

type FriendPresencePayload = {
      userId: string;
      timestamp: string;
};

type ConversationArchivedPayload = {
      conversationId: string;
      isArchived: boolean;
};

type ConversationMutedPayload = {
      conversationId: string;
      isMuted: boolean;
};

type ConversationsPage = { data: ConversationUI[]; meta: { limit: number; hasNextPage: boolean; nextCursor?: string } };

type ConversationsInfiniteData = InfiniteData<ConversationsPage, string | undefined>;

function formatTimestamp(isoDate: string): string {
      const date = new Date(isoDate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Vừa xong';
      if (diffMins < 60) return `${diffMins} phút`;
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)} giờ`;
      return date.toLocaleDateString('vi-VN');
}

function toPreviewText(msg: ConversationLastMessage | null | undefined): string {
      if (!msg) return '';

      if (msg.type !== 'TEXT') {
            if (msg.type === 'IMAGE') return '[Hình ảnh]';
            if (msg.type === 'VIDEO') return '[Video]';
            if (msg.type === 'FILE') return '[Tệp]';
            if (msg.type === 'STICKER') return '[Sticker]';
            if (msg.type === 'AUDIO' || msg.type === 'VOICE') return '[Ghi âm]';
            if (msg.type === 'SYSTEM') return '[Thông báo]';
            return '[Tin nhắn]';
      }

      return msg.content ?? '';
}

export function useConversationListRealtime(params: {
      conversationsQueryKey: readonly ['conversations', { limit: number }];
      selectedConversationId: string | null;
}) {
      const { conversationsQueryKey, selectedConversationId } = params;
      const queryClient = useQueryClient();
      const { socket, isConnected } = useSocket();

      const selectedIdRef = useRef(selectedConversationId);
      useEffect(() => {
            selectedIdRef.current = selectedConversationId;
      }, [selectedConversationId]);

      const selectedIdMemo = useMemo(() => selectedConversationId, [selectedConversationId]);

      useEffect(() => {
            if (!socket || !isConnected) return;

            const onConversationListItemUpdated = (
                  payload: ConversationListItemUpdatedPayload,
            ) => {
                  try {
                        queryClient.setQueryData<ConversationsInfiniteData>(
                              conversationsQueryKey,
                              (prev) => {
                                    if (!prev) return prev;

                                    const currentSelectedId = selectedIdRef.current;
                                    const isActive =
                                          currentSelectedId && payload.conversationId === currentSelectedId;

                                    let found: ConversationUI | undefined;
                                    const nextPages = prev.pages.map((page) => {
                                          const nextData: ConversationUI[] = [];

                                          for (const c of page.data) {
                                                if (c.id !== payload.conversationId) {
                                                      nextData.push(c);
                                                      continue;
                                                }
                                                found = c;
                                          }

                                          return { ...page, data: nextData };
                                    });

                                    if (!found) {
                                          return prev;
                                    }

                                    // Skip prepend for archived conversations — they belong
                                    // in the archived list, not the main sidebar.
                                    if (found.isArchived) {
                                          return prev;
                                    }

                                    const nextUnread = Math.max(
                                          0,
                                          (found.unreadCount ?? found.unread ?? 0) +
                                          (isActive ? 0 : payload.unreadCountDelta),
                                    );

                                    const updated: ConversationUI = {
                                          ...found,
                                          updatedAt: payload.lastMessageAt,
                                          lastMessageAt: payload.lastMessageAt,
                                          lastMessageObj: payload.lastMessage,
                                          lastMessage: toPreviewText(payload.lastMessage),
                                          timestamp: formatTimestamp(payload.lastMessageAt),
                                          unreadCount: nextUnread,
                                          unread: nextUnread,
                                    };

                                    const first = nextPages[0];
                                    nextPages[0] = { ...first, data: [updated, ...first.data] };

                                    return { ...prev, pages: nextPages };
                              },
                        );

                        // Also update archived list (and any feature-hook list) in-place.
                        // Key pattern ['conversations', 'list'] matches archived list
                        // but NOT the main list (which uses ['conversations', { limit }]).
                        const currentSelectedId = selectedIdRef.current;
                        const isActive =
                              currentSelectedId && payload.conversationId === currentSelectedId;

                        queryClient.setQueriesData<ConversationsInfiniteData>(
                              { queryKey: ['conversations', 'list'] },
                              (prev) => {
                                    if (!prev) return prev;
                                    let changed = false;
                                    const pages = prev.pages.map((page) => ({
                                          ...page,
                                          data: page.data.map((c) => {
                                                if (c.id !== payload.conversationId) return c;
                                                changed = true;
                                                const nextUnread = Math.max(
                                                      0,
                                                      (c.unreadCount ?? c.unread ?? 0) +
                                                      (isActive ? 0 : payload.unreadCountDelta),
                                                );
                                                return {
                                                      ...c,
                                                      updatedAt: payload.lastMessageAt,
                                                      lastMessageAt: payload.lastMessageAt,
                                                      lastMessageObj: payload.lastMessage,
                                                      lastMessage: toPreviewText(payload.lastMessage),
                                                      timestamp: formatTimestamp(payload.lastMessageAt),
                                                      unreadCount: nextUnread,
                                                      unread: nextUnread,
                                                };
                                          }),
                                    }));
                                    return changed ? { ...prev, pages } : prev;
                              },
                        );
                  } catch {
                        // ignore handler errors to avoid breaking all socket listeners
                  }
            };

            socket.on(
                  SocketEvents.CONVERSATION_LIST_ITEM_UPDATED,
                  onConversationListItemUpdated,
            );

            const onFriendOnline = (payload: FriendPresencePayload) => {
                  try {
                        queryClient.setQueryData<ConversationsInfiniteData>(
                              conversationsQueryKey,
                              (prev) => {
                                    if (!prev) return prev;
                                    const pages = prev.pages.map((page) => ({
                                          ...page,
                                          data: page.data.map((c) => {
                                                if (c.type !== 'DIRECT') return c;
                                                if (!c.otherUserId) return c;
                                                if (c.otherUserId !== payload.userId) return c;
                                                return { ...c, isOnline: true, lastSeenAt: null };
                                          }),
                                    }));
                                    return { ...prev, pages };
                              },
                        );
                  } catch {
                        // ignore handler errors
                  }
            };

            const onFriendOffline = (payload: FriendPresencePayload) => {
                  try {
                        queryClient.setQueryData<ConversationsInfiniteData>(
                              conversationsQueryKey,
                              (prev) => {
                                    if (!prev) return prev;
                                    const pages = prev.pages.map((page) => ({
                                          ...page,
                                          data: page.data.map((c) => {
                                                if (c.type !== 'DIRECT') return c;
                                                if (!c.otherUserId) return c;
                                                if (c.otherUserId !== payload.userId) return c;
                                                return { ...c, isOnline: false, lastSeenAt: payload.timestamp };
                                          }),
                                    }));
                                    return { ...prev, pages };
                              },
                        );
                  } catch {
                        // ignore handler errors
                  }
            };

            socket.on(SocketEvents.FRIEND_ONLINE, onFriendOnline);
            socket.on(SocketEvents.FRIEND_OFFLINE, onFriendOffline);

            // === Archive / Mute realtime sync (from other devices) ===

            const onConversationArchived = (payload: ConversationArchivedPayload) => {
                  try {
                        // Remove the conversation from this list (main or archived)
                        // and invalidate all conversation queries so both lists refetch
                        queryClient.setQueryData<ConversationsInfiniteData>(
                              conversationsQueryKey,
                              (prev) => {
                                    if (!prev) return prev;
                                    return {
                                          ...prev,
                                          pages: prev.pages.map((page) => ({
                                                ...page,
                                                data: page.data.filter(
                                                      (c) => c.id !== payload.conversationId,
                                                ),
                                          })),
                                    };
                              },
                        );
                        // Update detail cache
                        queryClient.setQueryData<ConversationUI>(
                              conversationKeys.detail(payload.conversationId),
                              (old) =>
                                    old
                                          ? {
                                                ...old,
                                                isArchived: payload.isArchived,
                                                ...(payload.isArchived
                                                      ? { isPinned: false, pinnedAt: null }
                                                      : {}),
                                          }
                                          : old,
                        );
                        // Invalidate all conversation lists (main + archived) to refetch
                        void queryClient.invalidateQueries({
                              queryKey: ['conversations', 'list'],
                        });
                  } catch {
                        // ignore handler errors
                  }
            };

            const onConversationMuted = (payload: ConversationMutedPayload) => {
                  try {
                        // Update isMuted in the list cache
                        queryClient.setQueryData<ConversationsInfiniteData>(
                              conversationsQueryKey,
                              (prev) => {
                                    if (!prev) return prev;
                                    return {
                                          ...prev,
                                          pages: prev.pages.map((page) => ({
                                                ...page,
                                                data: page.data.map((c) =>
                                                      c.id === payload.conversationId
                                                            ? { ...c, isMuted: payload.isMuted }
                                                            : c,
                                                ),
                                          })),
                                    };
                              },
                        );
                        // Update detail cache
                        queryClient.setQueryData<ConversationUI>(
                              conversationKeys.detail(payload.conversationId),
                              (old) =>
                                    old
                                          ? { ...old, isMuted: payload.isMuted }
                                          : old,
                        );
                  } catch {
                        // ignore handler errors
                  }
            };

            socket.on(SocketEvents.CONVERSATION_ARCHIVED, onConversationArchived);
            socket.on(SocketEvents.CONVERSATION_MUTED, onConversationMuted);

            return () => {
                  socket.off(
                        SocketEvents.CONVERSATION_LIST_ITEM_UPDATED,
                        onConversationListItemUpdated,
                  );

                  socket.off(SocketEvents.FRIEND_ONLINE, onFriendOnline);
                  socket.off(SocketEvents.FRIEND_OFFLINE, onFriendOffline);
                  socket.off(SocketEvents.CONVERSATION_ARCHIVED, onConversationArchived);
                  socket.off(SocketEvents.CONVERSATION_MUTED, onConversationMuted);
            };
      }, [socket, isConnected, queryClient, conversationsQueryKey, selectedIdMemo]);
}
