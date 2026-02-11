/**
 * useSearchSocket — Core WebSocket hook for search feature
 *
 * Quản lý toàn bộ search qua WebSocket:
 * - Đăng ký/hủy đăng ký search subscription
 * - Lắng nghe realtime events (results, newMatch, resultRemoved, suggestions, error, moreResults)
 * - Cập nhật Zustand store trực tiếp từ socket events
 *
 * Pattern: Giống use-message-socket.ts
 * - Ref-based handler registration (tránh re-register listeners khi state thay đổi)
 * - Cleanup khi unmount hoặc socket disconnect
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { SocketEvents } from '@/constants/socket-events';
import type { SearchStoreApi } from '../stores/search.store';
import type {
      SearchSubscribePayload,
      SearchUpdateQueryPayload,
      SearchResultsPayload,
      SearchNewMatchPayload,
      SearchResultRemovedPayload,
      SearchSuggestionsPayload,
      SearchErrorPayload,
      SearchSubscribeAck,
      SearchUnsubscribeAck,
      SearchUpdateQueryAck,
      SearchLoadMorePayload,
      SearchMoreResultsPayload,
} from '../types';

export function useSearchSocket(store: SearchStoreApi) {
      const { socket, isConnected } = useSocket();

      // Ref to store — avoid re-registering listeners when store actions change
      const storeRef = useRef(store.getState());
      useEffect(() => {
            // Subscribe to store changes and keep ref updated
            const unsub = store.subscribe((state) => {
                  storeRef.current = state;
            });
            return unsub;
      }, [store]);

      // ============================================================================
      // Socket Event Listeners — register once when socket/connection changes
      // ============================================================================

      useEffect(() => {
            if (!socket || !isConnected) return;

            /**
             * search:results — Initial search results from server
             */
            const onSearchResults = (payload: SearchResultsPayload) => {
                  try {
                        storeRef.current.setResults(payload);
                  } catch {
                        // Ignore handler errors
                  }
            };

            /**
             * search:newMatch — New message matches active search (realtime)
             */
            const onSearchNewMatch = (payload: SearchNewMatchPayload) => {
                  try {
                        storeRef.current.addNewMatch(payload);
                  } catch {
                        // Ignore handler errors
                  }
            };

            /**
             * search:resultRemoved — Message deleted, remove from results
             */
            const onSearchResultRemoved = (payload: SearchResultRemovedPayload) => {
                  try {
                        storeRef.current.removeResult(payload);
                  } catch {
                        // Ignore handler errors
                  }
            };

            /**
             * search:suggestions — Autocomplete suggestions from server
             */
            const onSearchSuggestions = (payload: SearchSuggestionsPayload) => {
                  try {
                        storeRef.current.setSuggestions(payload.suggestions);
                  } catch {
                        // Ignore handler errors
                  }
            };

            /**
             * search:error — Error notification from server
             */
            const onSearchError = (payload: SearchErrorPayload) => {
                  try {
                        storeRef.current.setError(payload.error);

                        // Handle specific error codes
                        if (payload.code === 'UNAUTHORIZED') {
                              // Auth refresh is handled by SocketManager automatically
                              console.warn('[SearchSocket] Unauthorized — socket will reconnect');
                        } else if (payload.code === 'RATE_LIMIT') {
                              console.warn('[SearchSocket] Rate limited — slow down');
                        }
                  } catch {
                        // Ignore handler errors
                  }
            };

            /**
             * search:moreResults — Paginated results from loadMore request
             */
            const onSearchMoreResults = (payload: SearchMoreResultsPayload) => {
                  try {
                        storeRef.current.appendMoreResults(payload);
                  } catch {
                        // Ignore handler errors
                  }
            };

            // Register all listeners
            socket.on(SocketEvents.SEARCH_RESULTS, onSearchResults);
            socket.on(SocketEvents.SEARCH_NEW_MATCH, onSearchNewMatch);
            socket.on(SocketEvents.SEARCH_RESULT_REMOVED, onSearchResultRemoved);
            socket.on(SocketEvents.SEARCH_SUGGESTIONS, onSearchSuggestions);
            socket.on(SocketEvents.SEARCH_ERROR, onSearchError);
            socket.on(SocketEvents.SEARCH_MORE_RESULTS, onSearchMoreResults);

            // Cleanup on unmount or socket change
            return () => {
                  socket.off(SocketEvents.SEARCH_RESULTS, onSearchResults);
                  socket.off(SocketEvents.SEARCH_NEW_MATCH, onSearchNewMatch);
                  socket.off(SocketEvents.SEARCH_RESULT_REMOVED, onSearchResultRemoved);
                  socket.off(SocketEvents.SEARCH_SUGGESTIONS, onSearchSuggestions);
                  socket.off(SocketEvents.SEARCH_ERROR, onSearchError);
                  socket.off(SocketEvents.SEARCH_MORE_RESULTS, onSearchMoreResults);
            };
      }, [socket, isConnected]);

      // ============================================================================
      // Emitters — stable refs, safe to call from anywhere
      // ============================================================================

      /**
       * Subscribe to a search query — emits search:subscribe
       * Server will respond with search:results event
       */
      const subscribe = useCallback(
            (payload: SearchSubscribePayload) => {
                  if (!socket || !isConnected) {
                        console.warn('[SearchSocket] Cannot subscribe — socket not connected');
                        return;
                  }

                  storeRef.current.setStatus('loading');

                  socket.emit(
                        SocketEvents.SEARCH_SUBSCRIBE,
                        payload,
                        (ack: SearchSubscribeAck) => {
                              if (ack.status === 'error') {
                                    storeRef.current.setError(
                                          ack.message ?? 'Failed to subscribe to search',
                                    );
                              }
                              // On success, results will arrive via search:results event
                        },
                  );
            },
            [socket, isConnected],
      );

      /**
       * Unsubscribe from current search — emits search:unsubscribe
       */
      const unsubscribe = useCallback(() => {
            if (!socket || !isConnected) return;

            socket.emit(
                  SocketEvents.SEARCH_UNSUBSCRIBE,
                  (ack: SearchUnsubscribeAck) => {
                        // Best-effort unsubscribe — don't need to handle errors
                        if (ack.status === 'error') {
                              console.warn('[SearchSocket] Unsubscribe failed');
                        }
                  },
            );
      }, [socket, isConnected]);

      /**
       * Update search query — emits search:updateQuery
       * Used when user changes keyword while already subscribed
       * Server will unsubscribe from old query and subscribe to new one
       */
      const updateQuery = useCallback(
            (payload: SearchUpdateQueryPayload) => {
                  if (!socket || !isConnected) {
                        console.warn(
                              '[SearchSocket] Cannot update query — socket not connected',
                        );
                        return;
                  }

                  storeRef.current.setStatus('loading');

                  socket.emit(
                        SocketEvents.SEARCH_UPDATE_QUERY,
                        payload,
                        (ack: SearchUpdateQueryAck) => {
                              if (ack.status === 'error') {
                                    storeRef.current.setError('Failed to update search query');
                              }
                              // On success, updated results will arrive via search:results event
                        },
                  );
            },
            [socket, isConnected],
      );

      /**
       * Load more results — emits search:loadMore
       * Server will respond with search:moreResults event
       */
      const loadMore = useCallback(
            (payload: SearchLoadMorePayload) => {
                  if (!socket || !isConnected) {
                        console.warn('[SearchSocket] Cannot loadMore — socket not connected');
                        return;
                  }

                  storeRef.current.setIsLoadingMore(true);

                  socket.emit(
                        SocketEvents.SEARCH_LOAD_MORE,
                        payload,
                        (ack: { status: string }) => {
                              if (ack.status === 'error') {
                                    storeRef.current.setIsLoadingMore(false);
                                    storeRef.current.setError('Failed to load more results');
                              }
                              // On success, results arrive via search:moreResults event
                        },
                  );
            },
            [socket, isConnected],
      );

      return {
            /** Subscribe to a search query */
            subscribe,
            /** Unsubscribe from current search */
            unsubscribe,
            /** Update search query (re-subscribe with new keyword) */
            updateQuery,
            /** Load more paginated results */
            loadMore,
            /** Whether socket is connected */
            isConnected,
      };
}
