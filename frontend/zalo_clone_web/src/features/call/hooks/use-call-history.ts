/**
 * useCallHistory — TanStack Query hooks for call history REST API.
 *
 * Provides:
 * - useCallHistory: infinite scroll list with cursor pagination
 * - useMissedCallCount: badge counter (polls every 30s)
 * - useMarkMissedAsViewed: mutation to clear missed badge
 * - useDeleteCallLog: mutation with optimistic update
 */

import {
      useInfiniteQuery,
      useQuery,
      useMutation,
      useQueryClient,
      type UseMutationOptions,
} from '@tanstack/react-query';
import {
      getCallHistory,
      getMissedCallCount,
      markMissedAsViewed,
      deleteCallLog,
} from '../api/call.api';
import type { GetCallHistoryParams } from '../api/call.api';
import type { CallHistoryStatus, CallHistoryRecord } from '../types';
import type { CursorPaginatedResponse } from '@/types/api';

// ============================================================================
// QUERY KEYS
// ============================================================================

const ALL_KEY = ['calls'] as const;

export const callQueryKeys = {
      all: ALL_KEY,
      history: (status?: CallHistoryStatus) => [...ALL_KEY, 'history', status] as const,
      missedCount: [...ALL_KEY, 'missedCount'] as const,
};

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Infinite-scroll call history with optional status filter.
 */
export function useCallHistory(status?: CallHistoryStatus) {
      return useInfiniteQuery({
            queryKey: callQueryKeys.history(status),
            queryFn: ({ pageParam }: { pageParam: string | undefined }) => {
                  const params: GetCallHistoryParams = { cursor: pageParam, limit: 20 };
                  if (status) params.status = status;
                  return getCallHistory(params);
            },
            initialPageParam: undefined as string | undefined,
            getNextPageParam: (lastPage: CursorPaginatedResponse<CallHistoryRecord>) =>
                  lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
      });
}

/**
 * Missed call count with 30s polling (for badge).
 */
export function useMissedCallCount() {
      return useQuery({
            queryKey: callQueryKeys.missedCount,
            queryFn: getMissedCallCount,
            refetchInterval: 30_000,
            staleTime: 10_000,
      });
}

/**
 * Mark all missed calls as viewed → invalidate missed count.
 */
export function useMarkMissedAsViewed(
      options?: UseMutationOptions<void, any, void, any>
) {
      const queryClient = useQueryClient();

      return useMutation({
            ...options,
            mutationFn: markMissedAsViewed,
            onSuccess: (...args) => {
                  void queryClient.invalidateQueries({ queryKey: callQueryKeys.missedCount });
                  options?.onSuccess?.(...args);
            },
      });
}

/**
 * Delete a single call log entry (optimistic removal from cache).
 */
export function useDeleteCallLog(
      options?: UseMutationOptions<void, any, string, any>
) {
      const queryClient = useQueryClient();

      return useMutation({
            ...options,
            mutationFn: deleteCallLog,
            onMutate: async (callId: string) => {
                  // Cancel any outgoing refetches to avoid race conditions
                  await queryClient.cancelQueries({ queryKey: callQueryKeys.all });

                  // Snapshot for rollback
                  const previousData = queryClient.getQueriesData({ queryKey: callQueryKeys.all });

                  // Optimistically remove from all history caches
                  queryClient.setQueriesData(
                        { queryKey: callQueryKeys.all },
                        (old: unknown) => {
                              if (!old || typeof old !== 'object' || !('pages' in old)) return old;
                              const data = old as { pages: CursorPaginatedResponse<CallHistoryRecord>[]; pageParams: unknown[] };
                              return {
                                    ...data,
                                    pages: data.pages.map((page) => ({
                                          ...page,
                                          data: page.data.filter((record) => record.id !== callId),
                                    })),
                              };
                        },
                  );

                  const customOnMutate = await (options?.onMutate as any)?.(callId);

                  return { previousData, ...(customOnMutate as any) };
            },
            onError: (...args) => {
                  const [, , context] = args;
                  // Rollback on error
                  if ((context as any)?.previousData) {
                        for (const [queryKey, data] of (context as any).previousData) {
                              queryClient.setQueryData(queryKey, data);
                        }
                  }
                  options?.onError?.(...args);
            },
            onSuccess: (...args) => {
                  options?.onSuccess?.(...args);
            },
            onSettled: (...args) => {
                  void queryClient.invalidateQueries({ queryKey: callQueryKeys.all });
                  options?.onSettled?.(...args);
            },
      });
}
