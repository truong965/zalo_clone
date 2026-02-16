/**
 * Conversation Feature — TanStack Query Hooks
 *
 * Provides query/mutation hooks for conversation operations.
 * Follows the same pattern as features/contacts/api/friendship.api.ts
 */

import {
      useInfiniteQuery,
      useQuery,
      useQueryClient,
      type UseQueryOptions,
} from '@tanstack/react-query';
import { conversationApi } from '../api/conversation.api';
import type { ConversationMemberInfo } from '../api/conversation.api';
import type { ConversationUI } from '@/features/conversation/types/conversation';

// ============================================================================
// Query Keys
// ============================================================================

export const conversationKeys = {
      all: ['conversations'] as const,
      list: (params?: { limit?: number }) =>
            [...conversationKeys.all, 'list', params] as const,
      groups: (params?: { limit?: number; search?: string }) =>
            [...conversationKeys.all, 'groups', params] as const,
      detail: (id: string) =>
            [...conversationKeys.all, 'detail', id] as const,
      members: (conversationId: string) =>
            [...conversationKeys.all, 'members', conversationId] as const,
      contactSearch: (params: { keyword: string; excludeIds?: string[] }) =>
            ['search', 'contacts', params] as const,
} as const;

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Infinite query for ALL conversations (direct + group).
 * Used by the main chat sidebar.
 */
export function useConversationsList(params?: { limit?: number }) {
      const limit = params?.limit ?? 20;

      return useInfiniteQuery({
            queryKey: conversationKeys.list({ limit }),
            initialPageParam: undefined as string | undefined,
            queryFn: ({ pageParam }) =>
                  conversationApi.getConversations({ cursor: pageParam, limit }),
            getNextPageParam: (lastPage) =>
                  lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
            staleTime: 30_000,
      });
}

/**
 * Infinite query for GROUP conversations only.
 * Used by the Contacts page "Nhóm" tab.
 */
export function useUserGroups(params?: { limit?: number; search?: string }) {
      const limit = params?.limit ?? 20;
      const search = params?.search;

      return useInfiniteQuery({
            queryKey: conversationKeys.groups({ limit, search }),
            initialPageParam: undefined as string | undefined,
            queryFn: ({ pageParam }) =>
                  conversationApi.getUserGroups({ cursor: pageParam, limit, search }),
            getNextPageParam: (lastPage) =>
                  lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
            staleTime: 30_000,
      });
}

/**
 * Query for a single conversation by ID.
 */
export function useConversationById(
      conversationId: string | null,
      options?: Partial<UseQueryOptions<ConversationUI>>,
) {
      return useQuery({
            queryKey: conversationKeys.detail(conversationId ?? ''),
            queryFn: () => conversationApi.getConversationById(conversationId!),
            enabled: !!conversationId,
            staleTime: 60_000,
            ...options,
      });
}

/**
 * Used for sender filter in search, and for group member lists.
 */
export function useConversationMembers(
      conversationId: string | null,
      options?: Partial<UseQueryOptions<ConversationMemberInfo[]>>,
) {
      return useQuery({
            queryKey: conversationKeys.members(conversationId ?? ''),
            queryFn: () => conversationApi.getConversationMembers(conversationId!),
            enabled: !!conversationId,
            staleTime: 60_000,
            ...options,
      });
}

/**
 * Infinite query for contact search (REST).
 * Used by the create group modal to search users to add.
 * Only enabled when keyword is non-empty (≥3 chars to match backend minLength).
 * excludeIds is optional; if too many, consider filtering on client side to avoid 400 Bad Request.
 */
export function useContactSearch(params: {
      keyword: string;
      limit?: number;
      excludeIds?: string[];
}) {
      const { keyword, limit = 20, excludeIds } = params;

      return useInfiniteQuery({
            queryKey: conversationKeys.contactSearch({ keyword, excludeIds }),
            initialPageParam: undefined as string | undefined,
            queryFn: ({ pageParam }) =>
                  conversationApi.searchContacts({
                        keyword,
                        cursor: pageParam,
                        limit,
                        excludeIds,
                  }),
            getNextPageParam: (lastPage) =>
                  lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
            enabled: keyword.length >= 3,
            staleTime: 15_000,
      });
}

// ============================================================================
// Invalidation Helpers
// ============================================================================

/**
 * Hook to get invalidation functions for conversation queries.
 * Use after mutations that affect conversation data.
 */
export function useInvalidateConversations() {
      const queryClient = useQueryClient();

      return {
            /** Invalidate all conversation queries */
            invalidateAll: () =>
                  queryClient.invalidateQueries({ queryKey: conversationKeys.all }),

            /** Invalidate only the conversation list (direct + group) */
            invalidateList: () =>
                  queryClient.invalidateQueries({ queryKey: conversationKeys.list() }),

            /** Invalidate only the groups list */
            invalidateGroups: () =>
                  queryClient.invalidateQueries({ queryKey: conversationKeys.groups() }),

            /** Invalidate a specific conversation detail */
            invalidateDetail: (id: string) =>
                  queryClient.invalidateQueries({ queryKey: conversationKeys.detail(id) }),

            /** Invalidate members of a specific conversation */
            invalidateMembers: (id: string) =>
                  queryClient.invalidateQueries({ queryKey: conversationKeys.members(id) }),

            /**
             * Remove conversation from cache and cancel pending queries.
             * Use before invalidateAll when user leaves/is kicked from a group
             * to prevent stale 400 errors.
             */
            removeFromCache: async (id: string) => {
                  // Cancel any in-flight queries for this conversation
                  await queryClient.cancelQueries({ queryKey: conversationKeys.detail(id) });
                  await queryClient.cancelQueries({ queryKey: conversationKeys.members(id) });

                  // Remove from cache so invalidateAll won't try to refetch
                  queryClient.removeQueries({ queryKey: conversationKeys.detail(id) });
                  queryClient.removeQueries({ queryKey: conversationKeys.members(id) });
            },
      };
}
