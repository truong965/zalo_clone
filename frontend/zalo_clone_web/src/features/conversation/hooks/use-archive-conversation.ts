/**
 * useArchiveConversation — Optimistic mutation for archiving/unarchiving conversations.
 *
 * Archiving removes the conversation from the main list and adds it to the
 * archived list; unarchiving does the reverse. Uses TanStack Query's optimistic
 * update pattern to provide instant UI feedback. On error, the cache is rolled
 * back to the previous state.
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

interface ToggleArchiveVars {
      conversationId: string;
      archived: boolean;
}

/**
 * Hook providing archive/unarchive mutation with optimistic cache update.
 *
 * When archiving:
 *   - Removes the conversation from main list pages
 *   - (Archived list is invalidated on settle so it picks up the change)
 *
 * When unarchiving:
 *   - Removes the conversation from archived list pages
 *   - (Main list is invalidated on settle so it picks up the change)
 *
 * On error, all conversation caches are rolled back to the snapshot.
 */
export function useArchiveConversation() {
      const queryClient = useQueryClient();

      const mutation = useMutation({
            mutationFn: ({ conversationId, archived }: ToggleArchiveVars) =>
                  conversationApi.toggleArchiveConversation(conversationId, archived),

            onMutate: async ({ conversationId, archived }) => {
                  // Cancel outgoing refetches
                  await queryClient.cancelQueries({ queryKey: CONVERSATIONS_QUERY_KEY });

                  // Snapshot ALL conversation queries for rollback
                  const previous = queryClient.getQueriesData<InfiniteData<ConversationsPage>>({
                        queryKey: CONVERSATIONS_QUERY_KEY,
                  });

                  // Optimistically remove from all paginated list caches
                  // (both main and archived — the item should disappear from whichever
                  // list it currently belongs to)
                  queryClient.setQueriesData<InfiniteData<ConversationsPage>>(
                        { queryKey: LIST_QUERY_KEY },
                        (old) => {
                              if (!old?.pages) return old;
                              return {
                                    ...old,
                                    pages: old.pages.map((page) => ({
                                          ...page,
                                          data: page.data.filter((c) => c.id !== conversationId),
                                    })),
                              };
                        },
                  );

                  // Also update the detail cache so sidebar reflects the new state
                  queryClient.setQueryData<ConversationUI>(
                        conversationKeys.detail(conversationId),
                        (old) =>
                              old
                                    ? {
                                          ...old,
                                          isArchived: archived,
                                          // Auto-unpin when archiving (matches backend behavior)
                                          ...(archived ? { isPinned: false, pinnedAt: null } : {}),
                                    }
                                    : old,
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
                  // Invalidate both main + archived lists so they refetch fresh data
                  void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
            },
      });

      const toggleArchive = useCallback(
            (conversationId: string, currentlyArchived: boolean) => {
                  mutation.mutate({ conversationId, archived: !currentlyArchived });
            },
            [mutation],
      );

      return {
            archiveConversation: (conversationId: string) =>
                  mutation.mutate({ conversationId, archived: true }),
            unarchiveConversation: (conversationId: string) =>
                  mutation.mutate({ conversationId, archived: false }),
            toggleArchive,
            isArchiving: mutation.isPending,
      };
}
