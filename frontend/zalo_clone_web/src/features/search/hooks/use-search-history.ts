/**
 * useSearchHistory — Search history hook (REST API)
 *
 * Fetches user's search history from analytics endpoint.
 * Uses TanStack Query for caching and automatic refetch.
 */

import { useQuery } from '@tanstack/react-query';
import { searchService } from '../api/search.service';
import type { SearchHistoryItem } from '../types';

/** TanStack Query key for search history */
export const SEARCH_HISTORY_QUERY_KEY = 'search-history';

export interface UseSearchHistoryOptions {
      /** Max number of history items (default: 20) */
      limit?: number;
      /** Whether to fetch history (default: true) */
      enabled?: boolean;
}

export function useSearchHistory(options?: UseSearchHistoryOptions) {
      const { limit = 20, enabled = true } = options ?? {};

      const {
            data: history,
            isLoading,
            error,
            refetch,
      } = useQuery({
            queryKey: [SEARCH_HISTORY_QUERY_KEY, limit] as const,
            queryFn: () => searchService.getSearchHistory(limit),
            enabled,
            staleTime: 60_000, // 1 minute
            gcTime: 5 * 60_000, // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
      });

      return {
            /** Search history items */
            history: history ?? ([] as SearchHistoryItem[]),
            /** Whether history is loading */
            isLoading,
            /** Error from API fetch */
            error,
            /** Manually refetch history */
            refetch,
      };
}
