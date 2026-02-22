/**
 * useConversationListMutations — Cache helpers for the conversations infinite query.
 *
 * Extracted from ChatFeature. All logic preserved exactly as-is.
 * Provides prepend / update / remove operations on the conversation list cache.
 */

import { useCallback, useMemo, useRef, useEffect } from 'react';
import {
      useInfiniteQuery,
      useQueryClient,
      type InfiniteData,
} from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import { conversationService } from '@/features/conversation';
import type { ConversationUI } from '../types';

type ConversationsPage = Awaited<ReturnType<typeof conversationService.getConversations>>;

export function useConversationListMutations() {
      const queryClient = useQueryClient();
      const conversationsLimit = 20;

      const conversationsQueryKey = useMemo(
            () => ['conversations', { limit: conversationsLimit }] as const,
            [conversationsLimit],
      );

      const conversationsQuery = useInfiniteQuery({
            queryKey: conversationsQueryKey,
            initialPageParam: undefined as string | undefined,
            queryFn: async ({ pageParam }) => {
                  return conversationService.getConversations({
                        cursor: pageParam,
                        limit: conversationsLimit,
                  });
            },
            getNextPageParam: (lastPage) => {
                  return lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined;
            },
      });

      const conversations = (conversationsQuery.data?.pages ?? []).flatMap((p) => p.data);
      const isLoadingConv = conversationsQuery.isLoading || conversationsQuery.isFetchingNextPage;
      const convHasMore = conversationsQuery.hasNextPage;

      // ── Infinite scroll trigger ────────────────────────────────────────────
      const { ref: convLoadMoreRef, inView: convInView } = useInView({
            threshold: 0.1,
            rootMargin: '100px',
      });

      const convQueryRef = useRef(conversationsQuery);
      convQueryRef.current = conversationsQuery;
      const convFetchingRef = useRef(false);

      const loadMoreConversations = useCallback(async () => {
            if (convFetchingRef.current) return;
            const q = convQueryRef.current;
            if (!q.hasNextPage || q.isFetchingNextPage) return;
            convFetchingRef.current = true;
            try {
                  await q.fetchNextPage();
            } finally {
                  convFetchingRef.current = false;
            }
      }, []);

      useEffect(() => {
            if (!convInView) return;
            void loadMoreConversations();
      }, [convInView, loadMoreConversations]);

      // ── Cache mutations ────────────────────────────────────────────────────
      const prependConversation = useCallback((item: ConversationUI) => {
            queryClient.setQueryData<InfiniteData<ConversationsPage, string | undefined>>(
                  conversationsQueryKey,
                  (prev) => {
                        if (!prev) {
                              return {
                                    pages: [{ data: [item], meta: { limit: conversationsLimit, hasNextPage: false } }],
                                    pageParams: [undefined],
                              };
                        }

                        // Remove from ALL pages to avoid duplicates (conversation may exist in page 2+)
                        const cleaned = prev.pages.map((page) => ({
                              ...page,
                              data: page.data.filter((c) => c.id !== item.id),
                        }));

                        // Prepend to first page
                        cleaned[0] = {
                              ...cleaned[0],
                              data: [item, ...cleaned[0].data],
                        };
                        return { ...prev, pages: cleaned };
                  });
      }, [queryClient, conversationsQueryKey, conversationsLimit]);

      const updateConversation = useCallback((conversationId: string, updates: Partial<ConversationUI>) => {
            queryClient.setQueryData<InfiniteData<ConversationsPage, string | undefined>>(
                  conversationsQueryKey,
                  (prev) => {
                        if (!prev) return prev;
                        const pages = prev.pages.map((page) => ({
                              ...page,
                              data: page.data.map((c) => (c.id === conversationId ? { ...c, ...updates } : c)),
                        }));
                        return { ...prev, pages };
                  });
      }, [queryClient, conversationsQueryKey]);

      const removeConversation = useCallback((conversationId: string) => {
            queryClient.setQueryData<InfiniteData<ConversationsPage, string | undefined>>(
                  conversationsQueryKey,
                  (prev) => {
                        if (!prev) return prev;

                        const nextPages = prev.pages.map((page) => ({
                              ...page,
                              data: page.data.filter((c) => c.id !== conversationId),
                        }));

                        return { ...prev, pages: nextPages };
                  });
      }, [queryClient, conversationsQueryKey]);

      return {
            conversations,
            conversationsQueryKey,
            conversationsQuery,
            isLoadingConv,
            convHasMore,
            convLoadMoreRef,
            prependConversation,
            updateConversation,
            removeConversation,
      };
}
