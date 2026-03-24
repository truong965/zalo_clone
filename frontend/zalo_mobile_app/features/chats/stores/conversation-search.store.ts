/**
 * Conversation Search Store (Mobile)
 *
 * Singleton Zustand store cho conversation-scoped search.
 * State được giữ nguyên khi user vẫn trong cùng conversation,
 * tự động reset khi conversationId thay đổi.
 *
 * Pattern: mirror web's useConversationSearchStore
 */

import { create } from 'zustand';
import type {
  SearchStatus,
  ConversationSearchFilters,
  MessageSearchResult,
} from '../search.types';

interface ConversationSearchState {
  // ── Identity ──────────────────────────────────────────────────────────────
  conversationId: string | undefined;

  // ── Search state ──────────────────────────────────────────────────────────
  keyword: string;
  results: MessageSearchResult[];
  status: SearchStatus;
  errorMessage: string | null;
  filters: ConversationSearchFilters;

  // ── Actions ───────────────────────────────────────────────────────────────
  setConversationId: (id: string | undefined) => void;
  setKeyword: (keyword: string) => void;
  setResults: (results: MessageSearchResult[]) => void;
  appendResult: (msg: MessageSearchResult) => void;
  removeResult: (messageId: string) => void;
  setStatus: (status: SearchStatus) => void;
  setError: (msg: string | null) => void;
  setFilters: (partial: Partial<ConversationSearchFilters>) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  conversationId: undefined,
  keyword: '',
  results: [],
  status: 'idle' as SearchStatus,
  errorMessage: null,
  filters: {},
};

export const useConversationSearchStore = create<ConversationSearchState>((set) => ({
  ...INITIAL_STATE,

  setConversationId: (id) => set({ conversationId: id }),

  setKeyword: (keyword) => set({ keyword }),

  setResults: (results) =>
    set({ results, status: 'success', errorMessage: null }),

  appendResult: (msg) =>
    set((s) => {
      // Deduplicate by id
      if (s.results.some((r) => r.id === msg.id)) return s;
      return { results: [msg, ...s.results] };
    }),

  removeResult: (messageId) =>
    set((s) => ({ results: s.results.filter((r) => r.id !== messageId) })),

  setStatus: (status) => set({ status }),

  setError: (errorMessage) => set({ errorMessage, status: 'error' }),

  setFilters: (partial) =>
    set((s) => ({ filters: { ...s.filters, ...partial } })),

  reset: () => set(INITIAL_STATE),
}));
