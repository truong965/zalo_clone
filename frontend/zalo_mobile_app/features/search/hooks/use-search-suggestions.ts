import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import type { SearchSuggestion } from '../types';

export const SEARCH_SUGGESTIONS_QUERY_KEY = 'search-suggestions';

export function useSearchSuggestions(prefix: string, limit = 10, enabled = true) {
      const { accessToken } = useAuth();

      const {
            data: suggestions,
            isLoading,
            error,
      } = useQuery({
            queryKey: [SEARCH_SUGGESTIONS_QUERY_KEY, prefix, limit, accessToken] as const,
            queryFn: () => {
                  if (!accessToken || !prefix) return [];
                  return mobileApi.getSuggestions(accessToken, prefix, limit);
            },
            enabled: enabled && !!accessToken && prefix.length > 0,
            staleTime: 30_000,
            gcTime: 2 * 60_000,
            retry: 0,
      });

      return {
            suggestions: suggestions ?? ([] as SearchSuggestion[]),
            isLoading,
            error,
      };
}
