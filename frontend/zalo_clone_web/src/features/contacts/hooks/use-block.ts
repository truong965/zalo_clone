/**
 * Block Feature — TanStack Query Hooks
 *
 * Provides query/mutation hooks for block operations.
 * Pattern follows features/conversation/hooks/use-conversation-queries.ts.
 */

import {
      useInfiniteQuery,
      useMutation,
      useQueryClient,
} from '@tanstack/react-query';
import { notification } from 'antd';
import { blockApi } from '../api/block.api';
import { handleInteractionError } from '@/utils/interaction-error';

// ============================================================================
// Query Keys
// ============================================================================

export const blockKeys = {
      all: ['blocks'] as const,
      blockedList: (params?: { limit?: number; search?: string }) =>
            [...blockKeys.all, 'list', params] as const,
} as const;

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Infinite query for the current user's blocked list.
 */
export function useBlockedList(params?: { limit?: number; search?: string }) {
      const limit = params?.limit ?? 20;
      const search = params?.search;

      return useInfiniteQuery({
            queryKey: blockKeys.blockedList({ limit, search }),
            initialPageParam: undefined as string | undefined,
            queryFn: ({ pageParam }) =>
                  blockApi.getBlockedList({ cursor: pageParam, limit, search }),
            getNextPageParam: (lastPage) =>
                  lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
            staleTime: 30_000,
      });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Mutation to block a user.
 * On success: invalidates blocked list + shows success notification.
 * On 403 error: uses handleInteractionError for consistent UX.
 */
export function useBlockUser() {
      const queryClient = useQueryClient();

      return useMutation({
            mutationFn: ({ targetUserId, reason }: { targetUserId: string; reason?: string }) =>
                  blockApi.blockUser(targetUserId, reason),
            onSuccess: () => {
                  void queryClient.invalidateQueries({ queryKey: blockKeys.all });
                  notification.success({
                        message: 'Đã chặn người dùng',
                        description: 'Người dùng đã bị chặn thành công.',
                  });
            },
            onError: (error) => {
                  handleInteractionError(error);
            },
      });
}

/**
 * Mutation to unblock a user.
 * On success: invalidates blocked list + shows success notification.
 */
export function useUnblockUser() {
      const queryClient = useQueryClient();

      return useMutation({
            mutationFn: (targetUserId: string) =>
                  blockApi.unblockUser(targetUserId),
            onSuccess: () => {
                  void queryClient.invalidateQueries({ queryKey: blockKeys.all });
                  notification.success({
                        message: 'Đã bỏ chặn',
                        description: 'Người dùng đã được bỏ chặn.',
                  });
            },
            onError: (error) => {
                  handleInteractionError(error);
            },
      });
}
