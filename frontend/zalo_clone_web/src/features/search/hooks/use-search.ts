/**
 * useSearch — Main orchestrator hook for search feature
 *
 * Kết hợp:
 * - useSearchSocket (WebSocket search)
 * - useSearchStore (Zustand state)
 * - lodash-es debounce (300ms input debounce)
 * - searchService (REST analytics)
 *
 * Cung cấp API đơn giản cho UI components:
 * - handleKeywordChange(keyword) — debounced search
 * - handleTabChange(tab) — switch search scope
 * - handleResultClick(resultId) — CTR tracking
 * - openSearch() / closeSearch() — toggle visibility
 */

import { useEffect, useMemo, useCallback, useRef } from 'react';
import { debounce } from 'lodash-es';
import { useSearchSocket } from './use-search-socket';
import { useGlobalSearchStore, useConversationSearchStore } from '../stores/search.store';
import type { SearchStoreApi } from '../stores/search.store';
import { searchService } from '../api/search.service';
import type {
      SearchTab,
      SearchSubscribePayload,
      SearchLoadMorePayload,
} from '../types';

/** Minimum keyword length to trigger search (matches backend minLength = 3) */
const MIN_KEYWORD_LENGTH = 3;

/** Debounce delay for search input (ms) */
const SEARCH_DEBOUNCE_MS = 300;

export interface UseSearchOptions {
      /** Scope search to a specific conversation (CONVERSATION mode) */
      conversationId?: string;
      /** Auto-subscribe when keyword changes (default: true) */
      autoSubscribe?: boolean;
      /** Which store instance to use (default: 'global') */
      store?: 'global' | 'conversation';
}

export function useSearch(options?: UseSearchOptions) {
      const { conversationId, autoSubscribe = true, store: storeOption = 'global' } = options ?? {};

      // --- Select store instance based on option ---
      const useStore: SearchStoreApi = storeOption === 'conversation'
            ? useConversationSearchStore
            : useGlobalSearchStore;

      // --- Store selectors (fine-grained to avoid unnecessary re-renders) ---
      const keyword = useStore((s) => s.keyword);
      const searchType = useStore((s) => s.searchType);
      const activeTab = useStore((s) => s.activeTab);
      const results = useStore((s) => s.results);
      const status = useStore((s) => s.status);
      const executionTimeMs = useStore((s) => s.executionTimeMs);
      const errorMessage = useStore((s) => s.errorMessage);
      const newMatches = useStore((s) => s.newMatches);
      const isSearchOpen = useStore((s) => s.isSearchOpen);
      const filters = useStore((s) => s.filters);
      const cursors = useStore((s) => s.cursors);
      const hasNextPage = useStore((s) => s.hasNextPage);
      const isLoadingMore = useStore((s) => s.isLoadingMore);

      // --- Store actions ---
      const setKeyword = useStore((s) => s.setKeyword);
      const setSearchType = useStore((s) => s.setSearchType);
      const setActiveTab = useStore((s) => s.setActiveTab);
      const setConversationId = useStore((s) => s.setConversationId);
      const setStatus = useStore((s) => s.setStatus);
      const openSearch = useStore((s) => s.openSearch);
      const closeSearch = useStore((s) => s.closeSearch);
      const resetSearch = useStore((s) => s.resetSearch);
      const mergeNewMatches = useStore((s) => s.mergeNewMatches);
      const setFilters = useStore((s) => s.setFilters);

      // --- Socket ---
      const { subscribe, unsubscribe, loadMore, isConnected } =
            useSearchSocket(useStore);

      // --- Refs for latest values in debounced callback ---
      const filtersRef = useRef(filters);
      useEffect(() => {
            filtersRef.current = filters;
      }, [filters]);

      const searchTypeRef = useRef(searchType);
      useEffect(() => {
            searchTypeRef.current = searchType;
      }, [searchType]);

      // --- Sync conversationId from options to store ---
      // Reset search state when conversationId changes to avoid stale keyword/filters
      // from a previous conversation leaking into the new one.
      // On mount, compare against the STORE's persisted conversationId to detect
      // unmount/remount with a different conversation (singleton store survives unmount).
      // After mount, use a local ref to track subsequent changes.
      const storeConversationId = useStore((s) => s.conversationId);
      const prevConversationIdRef = useRef<string | undefined>(undefined);
      useEffect(() => {
            const prevId = prevConversationIdRef.current;
            // First run (mount): compare against store's persisted conversationId
            // Subsequent runs: compare against the local ref
            const shouldReset = prevId === undefined
                  ? storeConversationId !== undefined && storeConversationId !== conversationId
                  : prevId !== conversationId;
            prevConversationIdRef.current = conversationId;

            if (shouldReset) {
                  resetSearch();
            }
            setConversationId(conversationId);
            if (conversationId) {
                  setSearchType('CONVERSATION');
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [conversationId, setConversationId, setSearchType, resetSearch]);

      // ============================================================================
      // Debounced search — 300ms delay before emitting to server
      // ============================================================================

      const debouncedSubscribe = useMemo(
            () =>
                  debounce((kw: string, convId?: string) => {
                        const payload: SearchSubscribePayload = {
                              keyword: kw,
                              searchType: searchTypeRef.current,
                              conversationId: convId,
                              filters: {
                                    messageType: filtersRef.current.messageType,
                                    mediaType: filtersRef.current.mediaType,
                                    fromUserId: filtersRef.current.fromUserId,
                                    startDate: filtersRef.current.startDate,
                                    endDate: filtersRef.current.endDate,
                              },
                        };

                        // Clean up undefined filter values
                        if (payload.filters) {
                              const f = payload.filters;
                              if (!f.messageType) delete f.messageType;
                              if (!f.mediaType) delete f.mediaType;
                              if (!f.fromUserId) delete f.fromUserId;
                              if (!f.startDate) delete f.startDate;
                              if (!f.endDate) delete f.endDate;
                              if (Object.keys(f).length === 0) delete payload.filters;
                        }

                        subscribe(payload);
                  }, SEARCH_DEBOUNCE_MS),
            [subscribe],
      );

      // Cleanup debounced function on unmount
      useEffect(() => {
            return () => {
                  debouncedSubscribe.cancel();
            };
      }, [debouncedSubscribe]);

      // ============================================================================
      // Action Handlers
      // ============================================================================

      /**
       * Handle keyword input change — debounced subscribe
       */
      const handleKeywordChange = useCallback(
            (newKeyword: string) => {
                  setKeyword(newKeyword);

                  const trimmed = newKeyword.trim();

                  // Clear search results if keyword too short, but keep the keyword in input
                  if (trimmed.length < MIN_KEYWORD_LENGTH) {
                        debouncedSubscribe.cancel();
                        if (keyword.trim().length >= MIN_KEYWORD_LENGTH) {
                              // Was searching, now clearing — unsubscribe
                              unsubscribe();
                        }
                        // Only reset results/status, NOT the keyword itself
                        setStatus('idle');
                        return;
                  }

                  if (!autoSubscribe) return;

                  // Show loading immediately for responsive UX
                  setStatus('loading');

                  // Debounced subscribe
                  debouncedSubscribe(trimmed, conversationId);
            },
            [
                  setKeyword,
                  keyword,
                  debouncedSubscribe,
                  conversationId,
                  autoSubscribe,
                  setStatus,
                  unsubscribe,
            ],
      );

      /**
       * Handle tab change — only changes UI tab, no re-subscribe.
       * Global search results already contain all categories from the initial GLOBAL search.
       * Tab switching is purely client-side filtering.
       */
      const handleTabChange = useCallback(
            (tab: SearchTab) => {
                  setActiveTab(tab);
            },
            [setActiveTab],
      );

      /**
       * Track result click — fire and forget CTR analytics
       */
      const handleResultClick = useCallback(
            (resultId: string) => {
                  const trimmed = keyword.trim();
                  if (!trimmed) return;

                  // Fire and forget — don't await
                  searchService.trackResultClick(trimmed, resultId).catch(() => {
                        // Silently ignore tracking errors
                  });
            },
            [keyword],
      );

      /**
       * Manually trigger a search (bypass debounce)
       * Includes current filters in the payload (unlike debouncedSubscribe which uses refs)
       */
      const triggerSearch = useCallback(
            (kw?: string) => {
                  const searchKeyword = (kw ?? keyword).trim();
                  if (searchKeyword.length < MIN_KEYWORD_LENGTH) return;

                  debouncedSubscribe.cancel();
                  setStatus('loading');

                  const payload: SearchSubscribePayload = {
                        keyword: searchKeyword,
                        searchType,
                        conversationId,
                        filters: {
                              messageType: filtersRef.current.messageType,
                              mediaType: filtersRef.current.mediaType,
                              fromUserId: filtersRef.current.fromUserId,
                              startDate: filtersRef.current.startDate,
                              endDate: filtersRef.current.endDate,
                        },
                  };

                  // Clean up undefined filter values
                  if (payload.filters) {
                        const f = payload.filters;
                        if (!f.messageType) delete f.messageType;
                        if (!f.mediaType) delete f.mediaType;
                        if (!f.fromUserId) delete f.fromUserId;
                        if (!f.startDate) delete f.startDate;
                        if (!f.endDate) delete f.endDate;
                        if (Object.keys(f).length === 0) delete payload.filters;
                  }

                  subscribe(payload);
            },
            [keyword, searchType, conversationId, debouncedSubscribe, setStatus, subscribe],
      );

      /**
       * Load more results for a specific search type
       * Uses cursor stored in state for the given type
       */
      const handleLoadMore = useCallback(
            (type: 'CONTACT' | 'GROUP' | 'MEDIA' | 'CONVERSATION') => {
                  const trimmed = keyword.trim();
                  if (trimmed.length < MIN_KEYWORD_LENGTH) return;

                  const cursorMap: Record<string, string | undefined> = {
                        CONTACT: cursors.contacts,
                        GROUP: cursors.groups,
                        MEDIA: cursors.media,
                        CONVERSATION: cursors.conversation,
                  };

                  const cursor = cursorMap[type];
                  if (!cursor) return; // No more pages

                  const payload: SearchLoadMorePayload = {
                        searchType: type,
                        keyword: trimmed,
                        cursor,
                        conversationId: type === 'CONVERSATION' ? conversationId : undefined,
                        mediaType: type === 'MEDIA' ? filters.mediaType : undefined,
                  };

                  loadMore(payload);
            },
            [keyword, cursors, conversationId, filters.mediaType, loadMore],
      );

      // ============================================================================
      // Auto re-search when filters change (with active keyword)
      // ============================================================================

      const prevFiltersJsonRef = useRef(JSON.stringify(filters));
      useEffect(() => {
            const currentJson = JSON.stringify(filters);
            if (prevFiltersJsonRef.current === currentJson) return;
            prevFiltersJsonRef.current = currentJson;

            // Only re-search if there's a valid keyword and auto-subscribe is enabled
            const trimmed = keyword.trim();
            if (trimmed.length < MIN_KEYWORD_LENGTH) return;
            if (!autoSubscribe) return;

            // Cancel pending debounce and immediately search with new filters
            debouncedSubscribe.cancel();
            setStatus('loading');

            const payload: SearchSubscribePayload = {
                  keyword: trimmed,
                  searchType,
                  conversationId,
                  filters: {
                        messageType: filters.messageType,
                        mediaType: filters.mediaType,
                        fromUserId: filters.fromUserId,
                        startDate: filters.startDate,
                        endDate: filters.endDate,
                  },
            };

            // Clean up undefined filter values
            if (payload.filters) {
                  const f = payload.filters;
                  if (!f.messageType) delete f.messageType;
                  if (!f.mediaType) delete f.mediaType;
                  if (!f.fromUserId) delete f.fromUserId;
                  if (!f.startDate) delete f.startDate;
                  if (!f.endDate) delete f.endDate;
                  if (Object.keys(f).length === 0) delete payload.filters;
            }

            subscribe(payload);
      }, [filters, keyword, searchType, conversationId, autoSubscribe, debouncedSubscribe, setStatus, subscribe]);

      // ============================================================================
      // Cleanup on unmount — unsubscribe from server
      // ============================================================================

      useEffect(() => {
            return () => {
                  debouncedSubscribe.cancel();
                  unsubscribe();
            };
            // Only run cleanup on unmount
            // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      // ============================================================================
      // Computed values
      // ============================================================================

      /** Whether there are results to display */
      const hasResults =
            results !== null &&
            ((results.messages?.length ?? 0) > 0 ||
                  (results.conversationMessages?.length ?? 0) > 0 ||
                  results.contacts.length > 0 ||
                  results.groups.length > 0 ||
                  results.media.length > 0);

      /** Number of pending realtime matches */
      const pendingMatchCount = newMatches.length;

      /** Whether search is active (keyword entered and results/loading) */
      const isSearchActive =
            keyword.trim().length >= MIN_KEYWORD_LENGTH &&
            (status === 'loading' || status === 'success');

      return {
            // --- State ---
            keyword,
            searchType,
            activeTab,
            results,
            status,
            executionTimeMs,
            errorMessage,
            newMatches,
            isSearchOpen,
            isConnected,
            filters,
            cursors,
            hasNextPage,
            isLoadingMore,

            // --- Computed ---
            hasResults,
            pendingMatchCount,
            isSearchActive,

            // --- Actions ---
            handleKeywordChange,
            handleTabChange,
            handleResultClick,
            handleLoadMore,
            triggerSearch,
            mergeNewMatches,
            setFilters,
            openSearch,
            closeSearch,
            resetSearch,
      };
}
