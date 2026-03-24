/**
 * useConversationSearch — Mobile conversation-scoped search hook
 *
 * Kết hợp:
 * - Socket.IO (search:subscribe / search:results / search:newMatch / search:resultRemoved / search:error)
 * - useConversationSearchStore (Zustand state)
 * - 300ms debounce cho input
 *
 * Pattern: mirror web's useSearch({ store: 'conversation', conversationId })
 *
 * State persistence:
 * - Store singleton survive screen unmount → state kept khi quay lại cùng conversation
 * - Auto-reset khi conversationId thay đổi
 */

import { useCallback, useEffect, useRef } from 'react';
import { socketManager } from '@/lib/socket';
import { SocketEvents } from '@/constants/socket-events';
import { useConversationSearchStore } from '../stores/conversation-search.store';
import type {
  SearchSubscribePayload,
  SearchResultsPayload,
  SearchNewMatchPayload,
  SearchResultRemovedPayload,
  SearchErrorPayload,
  ConversationSearchFilters,
} from '../search.types';

/** Minimum keyword length — matches backend minLength = 3 */
const MIN_KW = 3;
/** Debounce delay (ms) */
const DEBOUNCE_MS = 300;


export function useConversationSearch(conversationId: string) {
  // ── Store selectors ────────────────────────────────────────────────────────
  const keyword = useConversationSearchStore((s) => s.keyword);
  const results = useConversationSearchStore((s) => s.results);
  const status = useConversationSearchStore((s) => s.status);
  const errorMessage = useConversationSearchStore((s) => s.errorMessage);
  const filters = useConversationSearchStore((s) => s.filters);
  const storedConversationId = useConversationSearchStore((s) => s.conversationId);

  // ── Store actions ──────────────────────────────────────────────────────────
  const setConversationId = useConversationSearchStore((s) => s.setConversationId);
  const setKeyword = useConversationSearchStore((s) => s.setKeyword);
  const setResults = useConversationSearchStore((s) => s.setResults);
  const appendResult = useConversationSearchStore((s) => s.appendResult);
  const removeResult = useConversationSearchStore((s) => s.removeResult);
  const setStatus = useConversationSearchStore((s) => s.setStatus);
  const setError = useConversationSearchStore((s) => s.setError);
  const setFilters = useConversationSearchStore((s) => s.setFilters);
  const reset = useConversationSearchStore((s) => s.reset);

  // ── Detect conversation change → reset ────────────────────────────────────
  // Only reset if we already had a DIFFERENT conversation stored (not on first mount)
  useEffect(() => {
    if (storedConversationId !== undefined && storedConversationId !== conversationId) {
      reset();
    }
    setConversationId(conversationId);
  }, [conversationId, storedConversationId, reset, setConversationId]);

  // ── Keep filter ref for use inside debounced callback ─────────────────────
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  // ── Check socket connection ────────────────────────────────────────────────
  const isConnected = () => !!socketManager.getSocket()?.connected;

  // ── Emit search:subscribe ──────────────────────────────────────────────────
  const emitSubscribe = useCallback(
    (kw: string, currentFilters: ConversationSearchFilters) => {
      const socket = socketManager.getSocket();
      if (!socket?.connected) {
        console.warn('[useConversationSearch] Socket not connected');
        return;
      }

      const payload: SearchSubscribePayload = {
        keyword: kw,
        searchType: 'CONVERSATION',
        conversationId,
      };

      // Only add filters object if at least one filter is set
      const hasFilters =
        currentFilters.fromUserId ||
        currentFilters.startDate ||
        currentFilters.endDate;

      if (hasFilters) {
        payload.filters = {};
        if (currentFilters.fromUserId) payload.filters.fromUserId = currentFilters.fromUserId;
        if (currentFilters.startDate) payload.filters.startDate = currentFilters.startDate;
        if (currentFilters.endDate) payload.filters.endDate = currentFilters.endDate;
      }

      setStatus('loading');
      socket.emit(SocketEvents.SEARCH_SUBSCRIBE, payload);
    },
    [conversationId, setStatus],
  );

  // ── Debounce timer ref ─────────────────────────────────────────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDebounce = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, []);

  // ── Register socket event listeners ───────────────────────────────────────
  useEffect(() => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    const onResults = (payload: SearchResultsPayload) => {
      const messages = payload.results?.messages ?? [];
      setResults(messages);
    };

    const onNewMatch = (payload: SearchNewMatchPayload) => {
      // Only add if it belongs to the current conversation
      if (payload.conversationId === conversationId) {
        appendResult(payload.message);
      }
    };

    const onResultRemoved = (payload: SearchResultRemovedPayload) => {
      if (payload.conversationId === conversationId) {
        removeResult(payload.messageId);
      }
    };

    const onError = (payload: SearchErrorPayload) => {
      setError(payload.error || 'Đã xảy ra lỗi tìm kiếm');
    };

    socket.on(SocketEvents.SEARCH_RESULTS, onResults);
    socket.on(SocketEvents.SEARCH_NEW_MATCH, onNewMatch);
    socket.on(SocketEvents.SEARCH_RESULT_REMOVED, onResultRemoved);
    socket.on(SocketEvents.SEARCH_ERROR, onError);

    return () => {
      socket.off(SocketEvents.SEARCH_RESULTS, onResults);
      socket.off(SocketEvents.SEARCH_NEW_MATCH, onNewMatch);
      socket.off(SocketEvents.SEARCH_RESULT_REMOVED, onResultRemoved);
      socket.off(SocketEvents.SEARCH_ERROR, onError);
    };
  }, [conversationId, setResults, appendResult, removeResult, setError]);

  // ── Cleanup — unsubscribe on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelDebounce();
      const socket = socketManager.getSocket();
      if (socket?.connected) {
        socket.emit(SocketEvents.SEARCH_UNSUBSCRIBE, {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto re-search when filters change (if keyword is valid) ─────────────
  const prevFiltersRef = useRef(JSON.stringify(filters));
  useEffect(() => {
    const current = JSON.stringify(filters);
    if (prevFiltersRef.current === current) return;
    prevFiltersRef.current = current;

    const trimmed = keyword.trim();
    if (trimmed.length < MIN_KW) return;
    if (!isConnected()) return;

    cancelDebounce();
    emitSubscribe(trimmed, filters);
  }, [filters, keyword, cancelDebounce, emitSubscribe]);

  // ── handleKeywordChange — debounced ───────────────────────────────────────
  const handleKeywordChange = useCallback(
    (newKeyword: string) => {
      setKeyword(newKeyword);
      const trimmed = newKeyword.trim();

      if (trimmed.length < MIN_KW) {
        cancelDebounce();
        setStatus('idle');
        return;
      }

      setStatus('loading');
      cancelDebounce();

      debounceRef.current = setTimeout(() => {
        emitSubscribe(trimmed, filtersRef.current);
      }, DEBOUNCE_MS);
    },
    [setKeyword, setStatus, cancelDebounce, emitSubscribe],
  );

  // ── triggerSearch — immediate (bypass debounce) ───────────────────────────
  const triggerSearch = useCallback(
    (kw?: string) => {
      const searchKw = (kw ?? keyword).trim();
      if (searchKw.length < MIN_KW) return;
      cancelDebounce();
      emitSubscribe(searchKw, filtersRef.current);
    },
    [keyword, cancelDebounce, emitSubscribe],
  );

  // ── updateFilters ─────────────────────────────────────────────────────────
  const updateFilters = useCallback(
    (partial: Partial<ConversationSearchFilters>) => {
      setFilters(partial);
      // Re-search is triggered by the filters useEffect above
    },
    [setFilters],
  );

  // ── closeSearch ───────────────────────────────────────────────────────────
  const closeSearch = useCallback(() => {
    cancelDebounce();
    const socket = socketManager.getSocket();
    if (socket?.connected) {
      socket.emit(SocketEvents.SEARCH_UNSUBSCRIBE, {});
    }
    reset();
  }, [cancelDebounce, reset]);

  return {
    keyword,
    results,
    status,
    errorMessage,
    filters,
    isConnected: isConnected(),
    handleKeywordChange,
    triggerSearch,
    updateFilters,
    closeSearch,
  };
}
