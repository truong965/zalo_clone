/**
 * usePinConversation — Optimistic mutation for pinning/unpinning conversations.
 *
 * Uses TanStack Query's optimistic update pattern to provide instant UI feedback.
 * On error, the cache is rolled back to the previous state.
 */

import { useCallback } from 'react';
import {
      useMutation,
      useQueryClient,
      type InfiniteData,
} from '@tanstack/react-query';
import { conversationApi } from '../api/conversation.api';
import { conversationKeys } from './use-conversation-queries';
import type { ConversationUI, CursorPaginatedResponse } from '@/types/api';

type ConversationsPage = CursorPaginatedResponse<ConversationUI>;

/** Broad prefix to cancel/rollback/invalidate ALL conversation queries */
const CONVERSATIONS_QUERY_KEY = ['conversations'] as const;
/** Narrow prefix to match only the paginated list (not detail/members/etc.) */
const LIST_QUERY_KEY = ['conversations', 'list'] as const;

/**
 * Hook providing pin/unpin mutation with optimistic cache update.
 */
export function usePinConversation() {
      const queryClient = useQueryClient();

      const pinMutation = useMutation({
            mutationFn: (conversationId: string) =>
                  conversationApi.pinConversation(conversationId),
            onMutate: async (conversationId) => {
                  // Cancel outgoing refetches
                  await queryClient.cancelQueries({ queryKey: CONVERSATIONS_QUERY_KEY });

                  // Snapshot previous value
                  const previous = queryClient.getQueriesData<InfiniteData<ConversationsPage>>({
                        queryKey: CONVERSATIONS_QUERY_KEY,
                  });

                  // Optimistically update the paginated list cache
                  const now = new Date().toISOString();
                  queryClient.setQueriesData<InfiniteData<ConversationsPage>>(
                        { queryKey: LIST_QUERY_KEY },
                        (old) => {
                              if (!old?.pages) return old;
                              return {
                                    ...old,
                                    pages: old.pages.map((page) => ({
                                          ...page,
                                          data: page.data.map((c) =>
                                                c.id === conversationId
                                                      ? { ...c, isPinned: true, pinnedAt: now }
                                                      : c,
                                          ),
                                    })),
                              };
                        },
                  );

                  // Also optimistically update the detail cache (used by info sidebar)
                  queryClient.setQueryData<ConversationUI>(
                        conversationKeys.detail(conversationId),
                        (old) => (old ? { ...old, isPinned: true, pinnedAt: now } : old),
                  );

                  return { previous };
            },
            onError: (_err, _id, context) => {
                  // Rollback on error
                  if (context?.previous) {
                        for (const [key, data] of context.previous) {
                              if (data) queryClient.setQueryData(key, data);
                        }
                  }
            },
            onSettled: () => {
                  void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
            },
      });

      const unpinMutation = useMutation({
            mutationFn: (conversationId: string) =>
                  conversationApi.unpinConversation(conversationId),
            onMutate: async (conversationId) => {
                  await queryClient.cancelQueries({ queryKey: CONVERSATIONS_QUERY_KEY });

                  const previous = queryClient.getQueriesData<InfiniteData<ConversationsPage>>({
                        queryKey: CONVERSATIONS_QUERY_KEY,
                  });

                  queryClient.setQueriesData<InfiniteData<ConversationsPage>>(
                        { queryKey: LIST_QUERY_KEY },
                        (old) => {
                              if (!old?.pages) return old;
                              return {
                                    ...old,
                                    pages: old.pages.map((page) => ({
                                          ...page,
                                          data: page.data.map((c) =>
                                                c.id === conversationId
                                                      ? { ...c, isPinned: false, pinnedAt: null }
                                                      : c,
                                          ),
                                    })),
                              };
                        },
                  );

                  // Also optimistically update the detail cache
                  queryClient.setQueryData<ConversationUI>(
                        conversationKeys.detail(conversationId),
                        (old) => (old ? { ...old, isPinned: false, pinnedAt: null } : old),
                  );

                  return { previous };
            },
            onError: (_err, _id, context) => {
                  if (context?.previous) {
                        for (const [key, data] of context.previous) {
                              if (data) queryClient.setQueryData(key, data);
                        }
                  }
            },
            onSettled: () => {
                  void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
            },
      });

      const togglePin = useCallback(
            (conversationId: string, currentlyPinned: boolean) => {
                  if (currentlyPinned) {
                        unpinMutation.mutate(conversationId);
                  } else {
                        pinMutation.mutate(conversationId);
                  }
            },
            [pinMutation, unpinMutation],
      );

      return {
            pinConversation: pinMutation.mutate,
            unpinConversation: unpinMutation.mutate,
            togglePin,
            isPinning: pinMutation.isPending,
            isUnpinning: unpinMutation.isPending,
      };
}
