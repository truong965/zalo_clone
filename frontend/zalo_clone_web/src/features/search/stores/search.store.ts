/**
 * Search Store — Zustand state management for search feature
 *
 * Lý do dùng Zustand thay vì TanStack Query:
 * - Search state là ephemeral (không cần cache persistence)
 * - WebSocket events cần imperative updates (push-based)
 * - Shared state giữa SearchBar + SearchResults + socket listener
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { StoreApi, UseBoundStore } from 'zustand';
import type {
      SearchType,
      SearchTab,
      SearchStatus,
      SearchFilters,
      GlobalSearchResults,
      MessageSearchResult,
      SearchSuggestion,
      SearchResultsPayload,
      SearchNewMatchPayload,
      SearchResultRemovedPayload,
      SearchMoreResultsPayload,
      ContactSearchResult,
      GroupSearchResult,
      MediaSearchResult,
} from '../types';

// ============================================================================
// PAGINATION STATE (Phase 2)
// ============================================================================

/** Cursor state per search type */
export interface PaginationCursors {
      contacts?: string;
      groups?: string;
      media?: string;
      conversation?: string;
}

/** Has next page state per search type */
export interface PaginationHasNext {
      contacts: boolean;
      groups: boolean;
      media: boolean;
      conversation: boolean;
}

// ============================================================================
// STATE INTERFACE
// ============================================================================

export interface SearchState {
      // --- Query ---
      keyword: string;
      searchType: SearchType;
      conversationId: string | undefined;
      activeTab: SearchTab;
      filters: SearchFilters;

      // --- Results ---
      results: GlobalSearchResults | null;
      status: SearchStatus;
      executionTimeMs: number;
      errorMessage: string | null;

      // --- Pagination (Phase 2) ---
      cursors: PaginationCursors;
      hasNextPage: PaginationHasNext;
      isLoadingMore: boolean;

      // --- Realtime ---
      /** Buffer for realtime new matches (not yet merged into results) */
      newMatches: MessageSearchResult[];
      /** Set of messageIds that have been removed */
      removedMessageIds: Set<string>;

      // --- Suggestions ---
      suggestions: SearchSuggestion[];
      showSuggestions: boolean;

      // --- UI ---
      isSearchOpen: boolean;

      // --- Actions ---
      setKeyword: (keyword: string) => void;
      setSearchType: (type: SearchType) => void;
      setActiveTab: (tab: SearchTab) => void;
      setConversationId: (id: string | undefined) => void;
      setFilters: (filters: Partial<SearchFilters>) => void;
      setResults: (payload: SearchResultsPayload) => void;
      appendMoreResults: (payload: SearchMoreResultsPayload) => void;
      setIsLoadingMore: (loading: boolean) => void;
      addNewMatch: (payload: SearchNewMatchPayload) => void;
      removeResult: (payload: SearchResultRemovedPayload) => void;
      mergeNewMatches: () => void;
      setSuggestions: (suggestions: SearchSuggestion[]) => void;
      setShowSuggestions: (show: boolean) => void;
      setStatus: (status: SearchStatus) => void;
      setError: (message: string) => void;
      openSearch: () => void;
      closeSearch: () => void;
      resetSearch: () => void;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState = {
      keyword: '',
      searchType: 'GLOBAL' as SearchType,
      conversationId: undefined as string | undefined,
      activeTab: 'all' as SearchTab,
      filters: {} as SearchFilters,
      results: null as GlobalSearchResults | null,
      status: 'idle' as SearchStatus,
      executionTimeMs: 0,
      errorMessage: null as string | null,
      cursors: {} as PaginationCursors,
      hasNextPage: { contacts: false, groups: false, media: false, conversation: false } as PaginationHasNext,
      isLoadingMore: false,
      newMatches: [] as MessageSearchResult[],
      removedMessageIds: new Set<string>(),
      suggestions: [] as SearchSuggestion[],
      showSuggestions: false,
      isSearchOpen: false,
};

// ============================================================================
// STORE FACTORY
// ============================================================================

/** Type for store instances (used by hooks that accept store parameter) */
export type SearchStoreApi = UseBoundStore<StoreApi<SearchState>>;

/**
 * Factory function tạo store instance.
 * Cho phép tạo nhiều store độc lập (global vs conversation search).
 */
function createSearchStore(name: string): SearchStoreApi {
      return create<SearchState>()(
            devtools(
                  (set, get) => ({
                        ...initialState,

                        // --- Query Actions ---

                        setKeyword: (keyword) => set({ keyword }, false, 'search/setKeyword'),

                        setSearchType: (searchType) =>
                              set({ searchType }, false, 'search/setSearchType'),

                        setActiveTab: (activeTab) =>
                              set({ activeTab }, false, 'search/setActiveTab'),

                        setConversationId: (conversationId) =>
                              set({ conversationId }, false, 'search/setConversationId'),

                        setFilters: (filters) =>
                              set(
                                    (state) => ({ filters: { ...state.filters, ...filters } }),
                                    false,
                                    'search/setFilters',
                              ),

                        // --- Results Actions ---

                        setResults: (payload) =>
                              set(
                                    {
                                          results: payload.results,
                                          status: 'success',
                                          executionTimeMs: payload.executionTimeMs,
                                          errorMessage: null,
                                          // Clear realtime buffers when new results arrive
                                          newMatches: [],
                                          removedMessageIds: new Set<string>(),
                                          // Reset pagination cursors for fresh search
                                          cursors: {},
                                          hasNextPage: { contacts: false, groups: false, media: false, conversation: false },
                                          isLoadingMore: false,
                                    },
                                    false,
                                    'search/setResults',
                              ),

                        appendMoreResults: (payload) =>
                              set(
                                    (state) => {
                                          if (!state.results) return state;

                                          const { searchType, data, nextCursor, hasNextPage } = payload;
                                          const newCursors = { ...state.cursors };
                                          const newHasNext = { ...state.hasNextPage };

                                          const newResults = { ...state.results };

                                          switch (searchType) {
                                                case 'CONTACT':
                                                      newResults.contacts = [
                                                            ...newResults.contacts,
                                                            ...(data as ContactSearchResult[]),
                                                      ];
                                                      newCursors.contacts = nextCursor;
                                                      newHasNext.contacts = hasNextPage;
                                                      break;
                                                case 'GROUP':
                                                      newResults.groups = [
                                                            ...newResults.groups,
                                                            ...(data as GroupSearchResult[]),
                                                      ];
                                                      newCursors.groups = nextCursor;
                                                      newHasNext.groups = hasNextPage;
                                                      break;
                                                case 'MEDIA':
                                                      newResults.media = [
                                                            ...newResults.media,
                                                            ...(data as MediaSearchResult[]),
                                                      ];
                                                      newCursors.media = nextCursor;
                                                      newHasNext.media = hasNextPage;
                                                      break;
                                                case 'CONVERSATION':
                                                      newResults.messages = [
                                                            ...(newResults.messages || []),
                                                            ...(data as MessageSearchResult[]),
                                                      ];
                                                      newCursors.conversation = nextCursor;
                                                      newHasNext.conversation = hasNextPage;
                                                      break;
                                          }

                                          newResults.totalCount =
                                                (newResults.messages?.length ?? 0) +
                                                (newResults.conversationMessages?.length ?? 0) +
                                                newResults.contacts.length +
                                                newResults.groups.length +
                                                newResults.media.length;

                                          return {
                                                results: newResults,
                                                cursors: newCursors,
                                                hasNextPage: newHasNext,
                                                isLoadingMore: false,
                                          };
                                    },
                                    false,
                                    'search/appendMoreResults',
                              ),

                        setIsLoadingMore: (isLoadingMore) =>
                              set({ isLoadingMore }, false, 'search/setIsLoadingMore'),

                        addNewMatch: (payload) =>
                              set(
                                    (state) => {
                                          const existingMessages = state.results?.messages || [];
                                          const existingIndex = existingMessages.findIndex(
                                                (m) => m.id === payload.message.id,
                                          );

                                          if (existingIndex >= 0 && state.results) {
                                                const nextMessages = [...existingMessages];
                                                nextMessages[existingIndex] = payload.message;
                                                return {
                                                      results: {
                                                            ...state.results,
                                                            messages: nextMessages,
                                                      },
                                                };
                                          }

                                          const existsInBuffer = state.newMatches.some(
                                                (m) => m.id === payload.message.id,
                                          );
                                          if (existsInBuffer) return state;

                                          return {
                                                newMatches: [payload.message, ...state.newMatches],
                                          };
                                    },
                                    false,
                                    'search/addNewMatch',
                              ),

                        removeResult: (payload) =>
                              set(
                                    (state) => {
                                          const nextRemoved = new Set(state.removedMessageIds);
                                          nextRemoved.add(payload.messageId);

                                          // Also remove from newMatches buffer
                                          const nextNewMatches = state.newMatches.filter(
                                                (m) => m.id !== payload.messageId,
                                          );

                                          // Remove from current results if present
                                          // Handle both conversation search (messages[]) and global search (conversationMessages[])
                                          let nextResults = state.results;
                                          if (state.results) {
                                                if ('messages' in state.results && Array.isArray(state.results.messages)) {
                                                      nextResults = {
                                                            ...state.results,
                                                            messages: state.results.messages.filter(
                                                                  (m: MessageSearchResult) => m.id !== payload.messageId,
                                                            ),
                                                            totalCount: Math.max(0, state.results.totalCount - 1),
                                                      };
                                                } else {
                                                      // For global search with conversationMessages, just decrement totalCount
                                                      nextResults = {
                                                            ...state.results,
                                                            totalCount: Math.max(0, state.results.totalCount - 1),
                                                      };
                                                }
                                          }

                                          return {
                                                removedMessageIds: nextRemoved,
                                                newMatches: nextNewMatches,
                                                results: nextResults,
                                          };
                                    },
                                    false,
                                    'search/removeResult',
                              ),

                        mergeNewMatches: () =>
                              set(
                                    (state) => {
                                          if (!state.results || state.newMatches.length === 0) return state;

                                          // Only merge for conversation search which has messages[]
                                          // Global search uses conversationMessages[] — skip merge
                                          if (!('messages' in state.results) || !Array.isArray(state.results.messages)) {
                                                return { newMatches: [] };
                                          }

                                          // Merge new matches into messages, avoiding duplicates
                                          const existingIds = new Set(state.results.messages.map((m: MessageSearchResult) => m.id));
                                          const uniqueNew = state.newMatches.filter(
                                                (m) => !existingIds.has(m.id),
                                          );

                                          return {
                                                results: {
                                                      ...state.results,
                                                      messages: [...uniqueNew, ...state.results.messages],
                                                      totalCount: state.results.totalCount + uniqueNew.length,
                                                },
                                                newMatches: [],
                                          };
                                    },
                                    false,
                                    'search/mergeNewMatches',
                              ),

                        // --- Suggestions Actions ---

                        setSuggestions: (suggestions) =>
                              set({ suggestions }, false, 'search/setSuggestions'),

                        setShowSuggestions: (showSuggestions) =>
                              set({ showSuggestions }, false, 'search/setShowSuggestions'),

                        // --- Status Actions ---

                        setStatus: (status) => set({ status }, false, 'search/setStatus'),

                        setError: (message) =>
                              set(
                                    { status: 'error', errorMessage: message },
                                    false,
                                    'search/setError',
                              ),

                        // --- UI Actions ---

                        openSearch: () => set({ isSearchOpen: true }, false, 'search/open'),

                        closeSearch: () =>
                              set(
                                    {
                                          isSearchOpen: false,
                                          // Keep results but hide suggestions
                                          showSuggestions: false,
                                    },
                                    false,
                                    'search/close',
                              ),

                        resetSearch: () =>
                              set(
                                    {
                                          ...initialState,
                                          // Preserve isSearchOpen — only resetSearch clears query/results
                                          isSearchOpen: get().isSearchOpen,
                                    },
                                    false,
                                    'search/reset',
                              ),
                  }),
                  { name },
            ),
      );
}

// ============================================================================
// STORE INSTANCES — Hai store độc lập cho Global và Conversation search
// ============================================================================

/** Store cho SearchPanel (global search) */
export const useGlobalSearchStore = createSearchStore('GlobalSearchStore');

/** Store cho ChatSearchSidebar (in-conversation search) */
export const useConversationSearchStore = createSearchStore('ConversationSearchStore');

/** Store cho tim kiem ket ban theo so dien thoai */
export const useFriendSearchStore = createSearchStore('FriendSearchStore');

/** @deprecated Dùng useGlobalSearchStore hoặc useConversationSearchStore */
export const useSearchStore = useGlobalSearchStore;
