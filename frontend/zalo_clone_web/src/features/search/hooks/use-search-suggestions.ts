/**
 * useSearchSuggestions — Autocomplete suggestions hook
 *
 * Kết hợp 3 nguồn suggestions:
 * 1. REST API: /search/analytics/suggestions (user history + trending)
 * 2. Socket: search:suggestions event (server-pushed, nếu có)
 * 3. Store: suggestions từ useSearchStore (cập nhật bởi socket)
 *
 * Sử dụng TanStack Query cho REST calls + useDebounce cho prefix.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useDebounce } from '@/hooks';
import { searchService } from '../api/search.service';
import { useSearchStore } from '../stores/search.store';
import type { SearchSuggestion } from '../types';

/** Debounce delay for suggestion prefix (ms) — faster than search */
const SUGGESTION_DEBOUNCE_MS = 200;

/** Minimum prefix length to fetch suggestions */
const MIN_PREFIX_LENGTH = 1;

/** Max suggestions to return */
const MAX_SUGGESTIONS = 10;

/** TanStack Query key for suggestions */
const SUGGESTIONS_QUERY_KEY = 'search-suggestions';

export interface UseSearchSuggestionsOptions {
      /** Current input prefix */
      prefix: string;
      /** Whether suggestions should be fetched (default: true) */
      enabled?: boolean;
      /** Max number of suggestions (default: 10) */
      limit?: number;
}

export function useSearchSuggestions(options: UseSearchSuggestionsOptions) {
      const { prefix, enabled = true, limit = MAX_SUGGESTIONS } = options;

      // Debounce the prefix to avoid excessive API calls
      const debouncedPrefix = useDebounce(prefix, SUGGESTION_DEBOUNCE_MS);

      // Socket-pushed suggestions from store
      const socketSuggestions = useSearchStore((s) => s.suggestions);

      // ============================================================================
      // REST API suggestions (user history + algorithm-based)
      // ============================================================================

      const {
            data: apiSuggestions,
            isLoading,
            error,
      } = useQuery({
            queryKey: [SUGGESTIONS_QUERY_KEY, debouncedPrefix, limit] as const,
            queryFn: () => searchService.getSuggestions(debouncedPrefix, limit),
            enabled:
                  enabled && debouncedPrefix.trim().length >= MIN_PREFIX_LENGTH,
            staleTime: 30_000, // 30 seconds — suggestions don't change often
            gcTime: 60_000, // 1 minute garbage collection
            retry: 1,
            // Don't refetch aggressively for suggestions
            refetchOnWindowFocus: false,
            refetchOnMount: false,
      });

      // ============================================================================
      // Merge & deduplicate suggestions from all sources
      // ============================================================================

      const suggestions = useMemo(() => {
            const merged = new Map<string, SearchSuggestion>();

            // 1. Socket suggestions first (most recent from server)
            if (Array.isArray(socketSuggestions)) {
                  for (const suggestion of socketSuggestions) {
                        // FIX: Kiểm tra defensive, bỏ qua nếu không có keyword
                        if (!suggestion?.keyword) continue;

                        const key = suggestion.keyword.toLowerCase();
                        if (!merged.has(key)) {
                              merged.set(key, suggestion);
                        }
                  }
            }
            // // 1. Socket suggestions first (most recent from server)
            // for (const suggestion of socketSuggestions) {
            //       const key = suggestion.keyword.toLowerCase();
            //       if (!merged.has(key)) {
            //             merged.set(key, suggestion);
            //       }
            // }

            // 2. API suggestions (history/trending based)
            if (Array.isArray(apiSuggestions)) {
                  for (const suggestion of apiSuggestions) {
                        // FIX: Kiểm tra defensive, bỏ qua nếu không có keyword
                        if (!suggestion?.keyword) continue;

                        const key = suggestion.keyword.toLowerCase();
                        if (!merged.has(key)) {
                              merged.set(key, suggestion);
                        }
                  }
            }

            // Convert to array and limit
            return Array.from(merged.values()).slice(0, limit);
      }, [socketSuggestions, apiSuggestions, limit]);

      // ============================================================================
      // Categorized suggestions
      // ============================================================================

      const historySuggestions = useMemo(
            () => suggestions.filter((s) => s.fromHistory),
            [suggestions],
      );

      const trendingSuggestions = useMemo(
            () =>
                  suggestions
                        .filter((s) => !s.fromHistory && s.searchCount && s.searchCount > 0)
                        .sort((a, b) => (b.searchCount ?? 0) - (a.searchCount ?? 0)),
            [suggestions],
      );

      return {
            /** All merged suggestions */
            suggestions,
            /** Suggestions from user's search history */
            historySuggestions,
            /** Trending suggestions */
            trendingSuggestions,
            /** Whether suggestions are loading from API */
            isLoading,
            /** Error from API fetch */
            error,
      };
}
