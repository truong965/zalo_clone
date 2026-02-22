/**
 * useMarkAsSeen — Emit message:seen events and reset conversation unread count.
 *
 * Extracted from ChatFeature. All logic preserved exactly as-is.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { ConversationUI } from '../types';
import type { ChatMessage } from '../types';

type ConversationsPage = { data: ConversationUI[]; meta: { limit: number; hasNextPage: boolean; nextCursor?: string } };

interface UseMarkAsSeenParams {
      selectedId: string | null;
      currentUserId: string | null;
      messages: ChatMessage[];
      isMsgSocketConnected: boolean;
      emitMarkAsSeen: (dto: { conversationId: string; messageIds: string[] }) => void;
      conversationsQueryKey: readonly unknown[];
}

export function useMarkAsSeen(params: UseMarkAsSeenParams) {
      const {
            selectedId,
            currentUserId,
            messages,
            isMsgSocketConnected,
            emitMarkAsSeen,
            conversationsQueryKey,
      } = params;
      const queryClient = useQueryClient();

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

      // Track which messages have already been marked as seen to avoid re-emitting
      const seenMessageIdsRef = useRef(new Set<string>());

      // Reset seen tracking when conversation changes
      useEffect(() => {
            seenMessageIdsRef.current = new Set<string>();
      }, [selectedId]);

      // Use a ref to access current messages without adding it as a dependency
      const messagesRef = useRef(messages);
      useEffect(() => {
            messagesRef.current = messages;
      }, [messages]);

      useEffect(() => {
            if (!selectedId) return;
            if (!isMsgSocketConnected) return;
            if (messages.length === 0) return;

            const latestMessageId = messages[messages.length - 1]?.id;
            resetConversationUnread(selectedId, latestMessageId);

            // Only emit seen for messages NOT yet tracked in our local set
            const unseenMessageIds = messages
                  .filter((m) => (m.senderId ?? null) !== (currentUserId ?? null))
                  .filter((m) => !seenMessageIdsRef.current.has(m.id))
                  .slice(-50)
                  .map((m) => m.id);

            if (unseenMessageIds.length === 0) return;

            // Track these IDs so we never re-emit for them
            for (const id of unseenMessageIds) {
                  seenMessageIdsRef.current.add(id);
            }

            emitMarkAsSeen({
                  conversationId: selectedId,
                  messageIds: unseenMessageIds,
            });
            // NOTE: `messages` is intentionally kept as dependency so we catch NEW messages arriving.
            // The seenMessageIdsRef guard prevents re-emitting for messages already processed.
      }, [selectedId, isMsgSocketConnected, messages, currentUserId, emitMarkAsSeen, resetConversationUnread]);

      return { resetConversationUnread };
}
