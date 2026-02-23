/**
 * useMessageQuery — Owns the messages infinite query + dedup/mapping.
 *
 * Extracted from useChatMessages. All logic preserved exactly as-is.
 */

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { MessageListItem, MessageType } from '@/types/api';
import { messageService } from '../api/message.api';
import type { ChatMessage } from '../types';

function formatTime(iso: string): string {
      const d = new Date(iso);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function mapMessageToUI(m: MessageListItem, currentUserId: string | null): ChatMessage {
      const senderSide = currentUserId && m.senderId === currentUserId ? 'me' : 'other';
      const senderName = m.sender?.resolvedDisplayName ?? m.sender?.displayName;
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

export function useMessageQuery(params: {
      conversationId: string | null;
      limit: number;
      currentUserId: string | null;
}) {
      const { conversationId, limit, currentUserId } = params;

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
                  return messageService.getMessages({
                        conversationId,
                        cursor: pageParam,
                        limit,
                  });
            },
            getNextPageParam: (lastPage) => {
                  return lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined;
            },
            // Messages are updated real-time via socket events.
            // Disable auto-refetch to avoid race conditions + reduce backend load.
            staleTime: Infinity,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
      });

      const messagesDesc = (query.data?.pages ?? []).flatMap((p) => p.data);
      const newestMessageId = messagesDesc[0]?.id ?? null;

      // Dedup layer — safety net against duplicate key React error.
      const messagesAsc = useMemo(() => {
            const asc = [...messagesDesc].reverse();
            const seen = new Set<string>();
            const deduped = asc.filter((m) => {
                  if (seen.has(m.id)) {
                        return false;
                  }
                  seen.add(m.id);
                  return true;
            });
            return deduped.map((m) => mapMessageToUI(m, currentUserId));
      }, [messagesDesc, currentUserId]);

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

      return { query, queryKey, messagesAsc, newestMessageId, buildSendTextDto };
}
