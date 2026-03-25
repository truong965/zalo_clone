import { create } from 'zustand';
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
} from '../types';

export interface PaginationCursors {
      contacts?: string;
      groups?: string;
      media?: string;
      conversation?: string;
}

export interface PaginationHasNext {
      contacts: boolean;
      groups: boolean;
      media: boolean;
      conversation: boolean;
}

export interface SearchState {
      keyword: string;
      searchType: SearchType;
      conversationId: string | undefined;
      activeTab: SearchTab;
      filters: SearchFilters;

      results: GlobalSearchResults | null;
      status: SearchStatus;
      executionTimeMs: number;
      errorMessage: string | null;

      cursors: PaginationCursors;
      hasNextPage: PaginationHasNext;
      isLoadingMore: boolean;

      newMatches: MessageSearchResult[];
      removedMessageIds: Set<string>;

      suggestions: SearchSuggestion[];
      showSuggestions: boolean;

      isSearchOpen: boolean;

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

export type SearchStoreApi = UseBoundStore<StoreApi<SearchState>>;

function createSearchStore(): SearchStoreApi {
      return create<SearchState>()(
            (set, get) => ({
                  ...initialState,

                  setKeyword: (keyword) => set({ keyword }),
                  setSearchType: (searchType) => set({ searchType }),
                  setActiveTab: (activeTab) => set({ activeTab }),
                  setConversationId: (conversationId) => set({ conversationId }),
                  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),

                  setResults: (payload) =>
                        set({
                              results: payload.results,
                              status: 'success',
                              executionTimeMs: payload.executionTimeMs,
                              errorMessage: null,
                              newMatches: [],
                              removedMessageIds: new Set<string>(),
                              cursors: {},
                              hasNextPage: { contacts: false, groups: false, media: false, conversation: false },
                              isLoadingMore: false,
                        }),

                  appendMoreResults: (payload) =>
                        set((state) => {
                              if (!state.results) return state;

                              const { searchType, data, nextCursor, hasNextPage } = payload;
                              const newCursors = { ...state.cursors };
                              const newHasNext = { ...state.hasNextPage };
                              const newResults = { ...state.results };

                              switch (searchType) {
                                    case 'CONTACT':
                                          newResults.contacts = [...newResults.contacts, ...(data as ContactSearchResult[])];
                                          newCursors.contacts = nextCursor;
                                          newHasNext.contacts = hasNextPage;
                                          break;
                                    case 'GROUP':
                                          newResults.groups = [...newResults.groups, ...(data as GroupSearchResult[])];
                                          newCursors.groups = nextCursor;
                                          newHasNext.groups = hasNextPage;
                                          break;
                                    case 'CONVERSATION':
                                          newResults.messages = [...(newResults.messages || []), ...(data as MessageSearchResult[])];
                                          newCursors.conversation = nextCursor;
                                          newHasNext.conversation = hasNextPage;
                                          break;
                              }

                              newResults.totalCount =
                                    (newResults.messages?.length ?? 0) +
                                    (newResults.conversationMessages?.length ?? 0) +
                                    newResults.contacts.length +
                                    newResults.groups.length +
                                    (newResults.media?.length ?? 0);

                              return {
                                    results: newResults,
                                    cursors: newCursors,
                                    hasNextPage: newHasNext,
                                    isLoadingMore: false,
                              };
                        }),

                  setIsLoadingMore: (isLoadingMore) => set({ isLoadingMore }),

                  addNewMatch: (payload) =>
                        set((state) => {
                              const existingMessages = state.results?.messages || [];
                              const existingIndex = existingMessages.findIndex((m) => m.id === payload.message.id);

                              if (existingIndex >= 0 && state.results) {
                                    const nextMessages = [...existingMessages];
                                    nextMessages[existingIndex] = payload.message;
                                    return { results: { ...state.results, messages: nextMessages } };
                              }

                              const existsInBuffer = state.newMatches.some((m) => m.id === payload.message.id);
                              if (existsInBuffer) return state;

                              return { newMatches: [payload.message, ...state.newMatches] };
                        }),

                  removeResult: (payload) =>
                        set((state) => {
                              const nextRemoved = new Set(state.removedMessageIds);
                              nextRemoved.add(payload.messageId);

                              const nextNewMatches = state.newMatches.filter((m) => m.id !== payload.messageId);

                              let nextResults = state.results;
                              if (state.results) {
                                    if ('messages' in state.results && Array.isArray(state.results.messages)) {
                                          nextResults = {
                                                ...state.results,
                                                messages: state.results.messages.filter((m) => m.id !== payload.messageId),
                                                totalCount: Math.max(0, state.results.totalCount - 1),
                                          };
                                    } else {
                                          nextResults = { ...state.results, totalCount: Math.max(0, state.results.totalCount - 1) };
                                    }
                              }

                              return { removedMessageIds: nextRemoved, newMatches: nextNewMatches, results: nextResults };
                        }),

                  mergeNewMatches: () =>
                        set((state) => {
                              if (!state.results || state.newMatches.length === 0) return state;
                              if (!('messages' in state.results) || !Array.isArray(state.results.messages)) {
                                    return { newMatches: [] };
                              }

                              const existingIds = new Set(state.results.messages.map((m) => m.id));
                              const uniqueNew = state.newMatches.filter((m) => !existingIds.has(m.id));

                              return {
                                    results: {
                                          ...state.results,
                                          messages: [...uniqueNew, ...state.results.messages],
                                          totalCount: state.results.totalCount + uniqueNew.length,
                                    },
                                    newMatches: [],
                              };
                        }),

                  setSuggestions: (suggestions) => set({ suggestions }),
                  setShowSuggestions: (showSuggestions) => set({ showSuggestions }),
                  setStatus: (status) => set({ status }),
                  setError: (message) => set({ status: 'error', errorMessage: message }),
                  openSearch: () => set({ isSearchOpen: true }),
                  closeSearch: () => set({ isSearchOpen: false, showSuggestions: false }),
                  resetSearch: () => set({ ...initialState, isSearchOpen: get().isSearchOpen }),
            })
      );
}

export const useGlobalSearchStore = createSearchStore();
export const useConversationSearchStore = createSearchStore();
export const useFriendSearchStore = createSearchStore();
export const useSearchStore = useGlobalSearchStore;
