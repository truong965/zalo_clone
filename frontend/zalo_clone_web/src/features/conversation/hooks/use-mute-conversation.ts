/**
 * useMuteConversation — Optimistic mutation for muting/unmuting conversations.
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

interface ToggleMuteVars {
      conversationId: string;
      muted: boolean;
}

/**
 * Hook providing mute/unmute mutation with optimistic cache update.
 *
 * Flips `isMuted` in the paginated list and detail caches immediately,
 * rolls back on error, and invalidates on settle.
 */
export function useMuteConversation() {
      const queryClient = useQueryClient();

      const mutation = useMutation({
            mutationFn: ({ conversationId, muted }: ToggleMuteVars) =>
                  conversationApi.toggleMuteConversation(conversationId, muted),

            onMutate: async ({ conversationId, muted }) => {
                  // Cancel outgoing refetches
                  await queryClient.cancelQueries({ queryKey: CONVERSATIONS_QUERY_KEY });

                  // Snapshot previous value for rollback
                  const previous = queryClient.getQueriesData<InfiniteData<ConversationsPage>>({
                        queryKey: CONVERSATIONS_QUERY_KEY,
                  });

                  // Optimistically update the paginated list cache
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
                                                      ? { ...c, isMuted: muted }
                                                      : c,
                                          ),
                                    })),
                              };
                        },
                  );

                  // Also optimistically update the detail cache (used by info sidebar)
                  queryClient.setQueryData<ConversationUI>(
                        conversationKeys.detail(conversationId),
                        (old) => (old ? { ...old, isMuted: muted } : old),
                  );

                  return { previous };
            },

            onError: (_err, _vars, context) => {
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

      const toggleMute = useCallback(
            (conversationId: string, currentlyMuted: boolean) => {
                  mutation.mutate({ conversationId, muted: !currentlyMuted });
            },
            [mutation],
      );

      return {
            muteConversation: (conversationId: string) =>
                  mutation.mutate({ conversationId, muted: true }),
            unmuteConversation: (conversationId: string) =>
                  mutation.mutate({ conversationId, muted: false }),
            toggleMute,
            isMuting: mutation.isPending,
      };
}
