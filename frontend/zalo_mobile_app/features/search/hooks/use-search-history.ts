import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import type { SearchHistoryItem } from '../types';

export const SEARCH_HISTORY_QUERY_KEY = 'search-history';

export interface UseSearchHistoryOptions {
      limit?: number;
      enabled?: boolean;
}

export function useSearchHistory(options?: UseSearchHistoryOptions) {
      const { limit = 20, enabled = true } = options ?? {};
      const { accessToken } = useAuth();
      const queryClient = useQueryClient();

      const {
            data: history,
            isLoading,
            error,
            refetch,
      } = useQuery({
            queryKey: [SEARCH_HISTORY_QUERY_KEY, limit, accessToken] as const,
            queryFn: () => {
                  if (!accessToken) return [];
                  return mobileApi.getSearchHistory(accessToken, limit);
            },
            enabled: enabled && !!accessToken,
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
      });

      const deleteMutation = useMutation({
            mutationFn: (id: string) => {
                  if (!accessToken) throw new Error('No access token');
                  return mobileApi.deleteSearchHistory(accessToken, id);
            },
            onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: [SEARCH_HISTORY_QUERY_KEY] });
            },
      });

      const clearMutation = useMutation({
            mutationFn: () => {
                  if (!accessToken) throw new Error('No access token');
                  return mobileApi.clearSearchHistory(accessToken);
            },
            onSuccess: () => {
                  queryClient.setQueryData([SEARCH_HISTORY_QUERY_KEY, limit, accessToken], []);
            },
      });

      return {
            history: history ?? ([] as SearchHistoryItem[]),
            isLoading,
            error,
            refetch,
            deleteHistory: deleteMutation.mutate,
            clearHistory: clearMutation.mutate,
            isDeleting: deleteMutation.isPending,
            isClearing: clearMutation.isPending,
      };
}
