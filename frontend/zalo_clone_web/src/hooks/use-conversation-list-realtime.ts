import { useEffect, useMemo, useRef } from 'react';
import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from './use-socket';
import { SocketEvents } from '@/constants/socket-events';
import type { ConversationLastMessage } from '@/types/api';
import type { ChatConversation } from '@/features/chat/types';

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

type ConversationsPage = { data: ChatConversation[]; meta: { limit: number; hasNextPage: boolean; nextCursor?: string } };

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

            let found: ChatConversation | undefined;
            const nextPages = prev.pages.map((page) => {
              const nextData: ChatConversation[] = [];

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

            const nextUnread = Math.max(
              0,
              (found.unreadCount ?? found.unread ?? 0) +
              (isActive ? 0 : payload.unreadCountDelta),
            );

            const updated: ChatConversation = {
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

    return () => {
      socket.off(
        SocketEvents.CONVERSATION_LIST_ITEM_UPDATED,
        onConversationListItemUpdated,
      );

      socket.off(SocketEvents.FRIEND_ONLINE, onFriendOnline);
      socket.off(SocketEvents.FRIEND_OFFLINE, onFriendOffline);
    };
  }, [socket, isConnected, queryClient, conversationsQueryKey, selectedIdMemo]);
}
