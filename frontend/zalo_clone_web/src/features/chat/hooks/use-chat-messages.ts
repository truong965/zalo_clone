import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import type { CursorPaginatedResponse, MessageListItem, MessageType } from '@/types/api';
import { messageService } from '@/services/message.service';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import type { ChatMessage } from '../types';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function mapMessageToUI(m: MessageListItem, currentUserId: string | null): ChatMessage {
  const senderSide = currentUserId && m.senderId === currentUserId ? 'me' : 'other';
  const senderName = m.sender?.displayName;
  const avatar = m.sender?.avatarUrl ?? undefined;
  const displayTimestamp = m.createdAt ? formatTime(m.createdAt) : undefined;

  return {
    ...m,
    senderSide,
    senderName,
    avatar,
    displayTimestamp,
  };
}

export function useChatMessages(params: {
  conversationId: string | null;
  limit?: number;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { conversationId, limit = 50, messagesContainerRef } = params;
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const scrollSnapshotRef = useRef({ scrollHeight: 0, scrollTop: 0 });

  const queryKey = useMemo(
    () => ['messages', { conversationId, limit }] as const,
    [conversationId, limit],
  );

  const query = useInfiniteQuery({
    queryKey,
    enabled: !!conversationId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!conversationId) {
        return { data: [], meta: { limit, hasNextPage: false } };
      }

      if (messagesContainerRef.current) {
        scrollSnapshotRef.current = {
          scrollHeight: messagesContainerRef.current.scrollHeight,
          scrollTop: messagesContainerRef.current.scrollTop,
        };
      }

      return messageService.getMessages({
        conversationId,
        cursor: pageParam,
        limit,
      });
    },
    getNextPageParam: (lastPage) => {
      return lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined;
    },
  });

  const messagesDesc = (query.data?.pages ?? []).flatMap((p) => p.data);
  const messagesAsc = useMemo(() => {
    const asc = [...messagesDesc].reverse();
    return asc.map((m) => mapMessageToUI(m, currentUserId));
  }, [messagesDesc, currentUserId]);

  const preserveScrollAfterPrepend = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollHeight: oldScrollHeight, scrollTop: oldScrollTop } =
      scrollSnapshotRef.current;
    const newScrollHeight = container.scrollHeight;
    const heightDifference = newScrollHeight - oldScrollHeight;
    container.scrollTop = oldScrollTop + heightDifference;
  }, [messagesContainerRef]);

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, [messagesContainerRef]);

  useEffect(() => {
    if (!conversationId) return;
    queueMicrotask(() => setIsInitialLoad(true));
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    if (!query.data) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom();
        setTimeout(() => setIsInitialLoad(false), 200);
      });
    });
  }, [conversationId, query.data, scrollToBottom]);

  const loadOlder = useCallback(async () => {
    if (isInitialLoad) return;
    if (!query.hasNextPage) return;
    if (query.isFetchingNextPage) return;

    await query.fetchNextPage();

    requestAnimationFrame(() => {
      preserveScrollAfterPrepend();
    });
  }, [isInitialLoad, preserveScrollAfterPrepend, query]);

  const buildSendTextDto = useCallback(
    (text: string) => {
      if (!conversationId) return null;
      const dto: {
        conversationId: string;
        clientMessageId: string;
        type: MessageType;
        content: string;
      } = {
        conversationId,
        clientMessageId: crypto.randomUUID(),
        type: 'TEXT' as MessageType,
        content: text,
      };

      return dto;
    },
    [conversationId],
  );

  return {
    queryKey,
    query,
    messages: messagesAsc,
    isInitialLoad,
    scrollToBottom,
    loadOlder,
    buildSendTextDto,
  };
}

export type MessagesQueryData = InfiniteData<CursorPaginatedResponse<MessageListItem>, string | undefined>;
