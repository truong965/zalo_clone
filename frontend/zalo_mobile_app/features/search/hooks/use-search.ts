import { useEffect, useCallback, useRef } from 'react';
import { useSearchSocket } from './use-search-socket';
import { useAuth } from '@/providers/auth-provider';
import { mobileApi } from '@/services/api';
import {
      useGlobalSearchStore,
      useConversationSearchStore,
      useFriendSearchStore,
} from '../stores/search.store';
import type { SearchStoreApi } from '../stores/search.store';
import type {
      SearchTab,
      SearchSubscribePayload,
      SearchLoadMorePayload,
} from '../types';

const MIN_KEYWORD_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 300;

export interface UseSearchOptions {
      conversationId?: string;
      autoSubscribe?: boolean;
      store?: 'global' | 'conversation' | 'friend';
}

export function useSearch(options?: UseSearchOptions) {
    const { conversationId, autoSubscribe = true, store: storeOption = 'global' } = options ?? {};
    const { accessToken } = useAuth();

      const useStore: SearchStoreApi =
            storeOption === 'conversation'
                  ? useConversationSearchStore
                  : storeOption === 'friend'
                        ? useFriendSearchStore
                        : useGlobalSearchStore;

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

      const { subscribe, unsubscribe, loadMore, isConnected } = useSearchSocket(useStore);

      const filtersRef = useRef(filters);
      useEffect(() => {
            filtersRef.current = filters;
      }, [filters]);

      const searchTypeRef = useRef(searchType);
      useEffect(() => {
            searchTypeRef.current = searchType;
      }, [searchType]);

      const storeConversationId = useStore((s) => s.conversationId);
      const prevConversationIdRef = useRef<string | undefined>(undefined);
      
      useEffect(() => {
            const prevId = prevConversationIdRef.current;
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
      }, [conversationId, setConversationId, setSearchType, resetSearch, storeConversationId]);

      const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

      const cancelDebounce = useCallback(() => {
            if (debounceRef.current) {
                  clearTimeout(debounceRef.current);
                  debounceRef.current = null;
            }
      }, []);

      const debouncedSubscribe = useCallback((kw: string, convId?: string) => {
            cancelDebounce();
            debounceRef.current = setTimeout(() => {
                  const payload: SearchSubscribePayload = {
                        keyword: kw,
                        searchType: searchTypeRef.current,
                        conversationId: convId,
                        filters: { ...filtersRef.current },
                  };

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
            }, SEARCH_DEBOUNCE_MS);
      }, [subscribe, cancelDebounce]);

      useEffect(() => {
            return () => cancelDebounce();
      }, [cancelDebounce]);

      const handleKeywordChange = useCallback(
            (newKeyword: string) => {
                  setKeyword(newKeyword);
                  const trimmed = newKeyword.trim();

                  if (trimmed.length < MIN_KEYWORD_LENGTH) {
                        cancelDebounce();
                        if (keyword.trim().length >= MIN_KEYWORD_LENGTH) {
                              unsubscribe();
                        }
                        setStatus('idle');
                        return;
                  }

                  if (!autoSubscribe) return;
                  setStatus('loading');
                  debouncedSubscribe(trimmed, conversationId);
            },
            [setKeyword, keyword, cancelDebounce, unsubscribe, setStatus, autoSubscribe, debouncedSubscribe, conversationId]
      );

      const handleTabChange = useCallback(
            (tab: SearchTab) => {
                  setActiveTab(tab);
            },
            [setActiveTab]
      );

      const triggerSearch = useCallback(
            (kw?: string) => {
                  const searchKeyword = (kw ?? keyword).trim();
                  if (searchKeyword.length < MIN_KEYWORD_LENGTH) return;

                  cancelDebounce();
                  setStatus('loading');

                  const payload: SearchSubscribePayload = {
                        keyword: searchKeyword,
                        searchType,
                        conversationId,
                        filters: { ...filtersRef.current },
                  };

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
            [keyword, searchType, conversationId, cancelDebounce, setStatus, subscribe]
      );

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
                  if (!cursor) return;

                  const payload: SearchLoadMorePayload = {
                        searchType: type as any,
                        keyword: trimmed,
                        cursor,
                        conversationId: type === 'CONVERSATION' ? conversationId : undefined,
                        mediaType: type === 'MEDIA' ? filters.mediaType : undefined,
                        ...(type === 'CONVERSATION' && {
                              messageType: filters.messageType,
                              fromUserId: filters.fromUserId,
                              startDate: filters.startDate,
                              endDate: filters.endDate,
                        }),
                  };

                  loadMore(payload);
            },
            [keyword, cursors, conversationId, filters, loadMore]
      );

      const prevFiltersJsonRef = useRef(JSON.stringify(filters));
      useEffect(() => {
            const currentJson = JSON.stringify(filters);
            if (prevFiltersJsonRef.current === currentJson) return;

            const trimmed = keyword.trim();
            if (trimmed.length < MIN_KEYWORD_LENGTH) return;
            if (!autoSubscribe || !isConnected) return;

            prevFiltersJsonRef.current = currentJson;
            cancelDebounce();
            setStatus('loading');

            const payload: SearchSubscribePayload = {
                  keyword: trimmed,
                  searchType,
                  conversationId,
                  filters: { ...filters },
            };

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
      }, [filters, keyword, searchType, conversationId, autoSubscribe, cancelDebounce, setStatus, subscribe, isConnected]);

      useEffect(() => {
            return () => {
                  cancelDebounce();
                  unsubscribe();
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      const hasResults =
            results !== null &&
            ((results.messages?.length ?? 0) > 0 ||
                  (results.conversationMessages?.length ?? 0) > 0 ||
                  results.contacts.length > 0 ||
                  results.groups.length > 0 ||
                  (results.media?.length ?? 0) > 0);

      const pendingMatchCount = newMatches.length;

      const isSearchActive =
            keyword.trim().length >= MIN_KEYWORD_LENGTH &&
            (status === 'loading' || status === 'success');

      const handleResultClick = useCallback(
            (resultId: string) => {
                  const trimmed = keyword.trim();
                  if (!trimmed || !accessToken) return;

                  mobileApi.trackResultClick(accessToken, trimmed, resultId).catch(() => {
                        // Silently ignore tracking errors
                  });
            },
            [keyword, accessToken]
      );

      return {
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

            hasResults,
            pendingMatchCount,
            isSearchActive,

            handleKeywordChange,
            handleTabChange,
            handleResultClick,
            handleLoadMore,
            triggerSearch,
            mergeNewMatches,
            setFilters,
            setSearchType,
            openSearch,
            closeSearch,
            resetSearch,
      };
}
