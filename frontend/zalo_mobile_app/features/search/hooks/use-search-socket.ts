import { useEffect, useRef, useCallback } from 'react';
import { useSocket } from '@/providers/socket-provider';
import { socketManager } from '@/lib/socket';
import { SocketEvents } from '@/constants/socket-events';
import type { SearchStoreApi } from '../stores/search.store';
import type {
      SearchSubscribePayload,
      SearchResultsPayload,
      SearchNewMatchPayload,
      SearchResultRemovedPayload,
      SearchSuggestionsPayload,
      SearchErrorPayload,
      SearchLoadMorePayload,
      SearchMoreResultsPayload,
} from '../types';

export function useSearchSocket(store: SearchStoreApi) {
      const { socket, isConnected } = useSocket();

      const storeRef = useRef(store.getState());
      useEffect(() => {
            const unsub = store.subscribe((state) => {
                  storeRef.current = state;
            });
            return unsub;
      }, [store]);

      useEffect(() => {
            if (!socket || !isConnected) return;

            const onSearchResults = (payload: SearchResultsPayload) => {
                  try {
                        storeRef.current.setResults(payload);
                  } catch { }
            };

            const onSearchNewMatch = (payload: SearchNewMatchPayload) => {
                  try {
                        storeRef.current.addNewMatch(payload);
                  } catch { }
            };

            const onSearchResultRemoved = (payload: SearchResultRemovedPayload) => {
                  try {
                        storeRef.current.removeResult(payload);
                  } catch { }
            };

            const onSearchSuggestions = (payload: SearchSuggestionsPayload) => {
                  try {
                        storeRef.current.setSuggestions(payload.suggestions);
                  } catch { }
            };

            const onSearchError = (payload: SearchErrorPayload) => {
                  try {
                        storeRef.current.setError(payload.error);
                  } catch { }
            };

            const onSearchMoreResults = (payload: SearchMoreResultsPayload) => {
                  try {
                        storeRef.current.appendMoreResults(payload);
                  } catch { }
            };

            socket.on(SocketEvents.SEARCH_RESULTS, onSearchResults);
            socket.on(SocketEvents.SEARCH_NEW_MATCH, onSearchNewMatch);
            socket.on(SocketEvents.SEARCH_RESULT_REMOVED, onSearchResultRemoved);
            socket.on(SocketEvents.SEARCH_SUGGESTIONS, onSearchSuggestions);
            socket.on(SocketEvents.SEARCH_ERROR, onSearchError);
            socket.on(SocketEvents.SEARCH_MORE_RESULTS, onSearchMoreResults);

            return () => {
                  socket.off(SocketEvents.SEARCH_RESULTS, onSearchResults);
                  socket.off(SocketEvents.SEARCH_NEW_MATCH, onSearchNewMatch);
                  socket.off(SocketEvents.SEARCH_RESULT_REMOVED, onSearchResultRemoved);
                  socket.off(SocketEvents.SEARCH_SUGGESTIONS, onSearchSuggestions);
                  socket.off(SocketEvents.SEARCH_ERROR, onSearchError);
                  socket.off(SocketEvents.SEARCH_MORE_RESULTS, onSearchMoreResults);
            };
      }, [socket, isConnected]);

      const subscribe = useCallback(
            async (payload: SearchSubscribePayload) => {
                  if (!isConnected || !socket) return;
                  storeRef.current.setStatus('loading');
                  try {
                        socket.emit(SocketEvents.SEARCH_SUBSCRIBE, payload);
                  } catch (err: any) {
                        storeRef.current.setError(err.message || 'Failed to subscribe');
                  }
            },
            [isConnected, socket],
      );

      const unsubscribe = useCallback(async () => {
            if (!isConnected || !socket) return;
            try {
                  socket.emit(SocketEvents.SEARCH_UNSUBSCRIBE, {});
            } catch { }
      }, [isConnected, socket]);

      const updateQuery = useCallback(
            async (payload: any) => {
                  if (!isConnected || !socket) return;
                  storeRef.current.setStatus('loading');
                  try {
                        socket.emit(SocketEvents.SEARCH_UPDATE_QUERY, payload);
                  } catch (err: any) {
                        storeRef.current.setError(err.message || 'Failed to update query');
                  }
            },
            [isConnected, socket],
      );

      const loadMore = useCallback(
            async (payload: SearchLoadMorePayload) => {
                  if (!isConnected || !socket) return;
                  storeRef.current.setIsLoadingMore(true);
                  try {
                        socket.emit(SocketEvents.SEARCH_LOAD_MORE, payload);
                  } catch (err: any) {
                        storeRef.current.setIsLoadingMore(false);
                        storeRef.current.setError(err.message || 'Failed to load more');
                  }
            },
            [isConnected, socket],
      );

      return {
            subscribe,
            unsubscribe,
            updateQuery,
            loadMore,
            isConnected,
      };
}
