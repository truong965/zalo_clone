/**
 * useJumpToMessage — Context fetch, highlight, loadNewer, returnToLatest.
 *
 * Extracted from useChatMessages. All logic preserved exactly as-is.
 *
 * 3 cases:
 *   A) Conversation not ready (isInitialLoad || !query.data) → save pendingJumpRef
 *   B) Message already loaded in query data → scroll + highlight
 *   C) Message not loaded → fetch context API, replace query data, scroll + highlight
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { CursorPaginatedResponse, MessageListItem } from '@/types/api';
import { messageService } from '../api/message.api';

type MessagesQueryKey = readonly ['messages', { conversationId: string | null; limit: number }];

export function useJumpToMessage(params: {
      conversationId: string | null;
      limit: number;
      queryKey: MessagesQueryKey;
      messagesContainerRef: React.RefObject<HTMLDivElement | null>;
      isInitialLoad: boolean;
      isFetchingOlderRef: React.MutableRefObject<boolean>;
      isFetchingNewerRef: React.MutableRefObject<boolean>;
      scrollToBottom: () => void;
}) {
      const {
            conversationId,
            limit,
            queryKey,
            messagesContainerRef,
            isInitialLoad,
            isFetchingOlderRef,
            isFetchingNewerRef,
            scrollToBottom,
      } = params;

      const queryClient = useQueryClient();
      const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
      const [isJumpedAway, setIsJumpedAway] = useState(false);

      // ============================================================================
      // Pending Jump — saves jump intent when conversation is not ready yet.
      // When user clicks search result → setSelectedId(convId) + jumpToMessage(msgId)
      // are called simultaneously. At that point useInfiniteQuery has no data
      // (isInitialLoad = true). pendingJumpRef stores targetMessageId, and the
      // useEffect below will execute the jump when initial load completes.
      // ============================================================================
      const pendingJumpRef = useRef<string | null>(null);

      // Cursor for fetching newer messages (scroll down after jump)
      const newerCursorRef = useRef<string | null>(null);

      // ============================================================================
      // Jump Guard — shared ref for use-message-socket to know when jumping.
      // When isJumpingRef = true, socket handler buffers messages instead of
      // upserting immediately — avoids race between context replacement and socket.
      // ============================================================================
      const isJumpingRef = useRef(false);
      const jumpBufferRef = useRef<MessageListItem[]>([]);

      // Ref-based access to avoid re-creating callbacks
      const isInitialLoadRef = useRef(isInitialLoad);
      isInitialLoadRef.current = isInitialLoad;

      // ── Reset on conversation change ───────────────────────────────────
      useEffect(() => {
            if (!conversationId) return;
            queueMicrotask(() => {
                  setHighlightedMessageId(null);
                  setIsJumpedAway(false);
            });
            // Don't clear pendingJumpRef here — it's set BEFORE conversationId changes
            // and needs to persist until initial load completes.
      }, [conversationId]);

      // Helper: scroll to DOM element + highlight (no state deps other than refs)
      const scrollAndHighlight = useCallback(
            (msgId: string) => {
                  setHighlightedMessageId(msgId);
                  setTimeout(() => setHighlightedMessageId(null), 3000);

                  requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                              const container = messagesContainerRef.current;
                              if (!container) return;
                              const el = container.querySelector(`[data-message-id="${msgId}"]`);
                              if (el) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                        });
                  });
            },
            [messagesContainerRef],
      );

      // Ref to access latest query data without re-creating jumpToMessage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const queryDataRef = useRef<InfiniteData<CursorPaginatedResponse<MessageListItem>, any> | undefined>(undefined);

      const jumpToMessage = useCallback(
            async (targetMessageId: string) => {
                  if (!conversationId) return;

                  // Case A: Conversation not ready → save pending intent
                  // useEffect below will pick up when isInitialLoad → false
                  if (isInitialLoadRef.current || !queryDataRef.current) {
                        pendingJumpRef.current = targetMessageId;
                        return;
                  }

                  // Case B: Message already loaded in current query data — just scroll
                  const allLoadedMessages = (queryDataRef.current?.pages ?? []).flatMap((p) => p.data);
                  const existsInLoaded = allLoadedMessages.some((m) => m.id === targetMessageId);

                  if (existsInLoaded) {
                        scrollAndHighlight(targetMessageId);
                        return;
                  }

                  // Case C: Message not loaded — fetch context from backend,
                  // REPLACE query data with context only (no merge to avoid gaps).
                  // Set flags to block scroll effects + guard socket upserts.
                  isFetchingOlderRef.current = true;
                  isFetchingNewerRef.current = true;
                  isJumpingRef.current = true;
                  jumpBufferRef.current = [];
                  try {
                        const context = await messageService.getMessageContext({
                              conversationId,
                              messageId: targetMessageId,
                              before: 25,
                              after: 25,
                        });

                        const contextMessages = context.data;

                        // Sort DESC by createdAt
                        const sorted = [...contextMessages].sort((a, b) => {
                              const aT = new Date(a.createdAt).getTime();
                              const bT = new Date(b.createdAt).getTime();
                              return bT - aT;
                        });

                        // REPLACE entire query data with context page only.
                        // Avoids the "gap" problem where merge creates a single page
                        // with messages 300-250 + 1-50 but 51-249 are missing and cursor
                        // points to message 1 making loadOlder useless.
                        const contextPage: CursorPaginatedResponse<MessageListItem> = {
                              data: sorted,
                              meta: {
                                    limit,
                                    hasNextPage: context.hasOlderMessages,
                                    nextCursor: context.hasOlderMessages && sorted.length > 0
                                          ? sorted[sorted.length - 1].id
                                          : undefined,
                              },
                        };

                        queryClient.setQueryData<InfiniteData<CursorPaginatedResponse<MessageListItem>, string | undefined>>(
                              queryKey,
                              () => ({
                                    pages: [contextPage],
                                    pageParams: [undefined],
                              }),
                        );

                        // Mark that user has jumped away from latest messages
                        setIsJumpedAway(true);

                        // Store newer cursor for scroll-down support
                        newerCursorRef.current = context.hasNewerMessages && sorted.length > 0
                              ? sorted[0].id
                              : null;
                        if (!context.hasNewerMessages) {
                              setIsJumpedAway(false);
                        }

                        // Wait for React to render the replaced data, then scroll
                        setTimeout(() => {
                              scrollAndHighlight(targetMessageId);
                              // Reset newer guard after scroll settles — sentinel may have
                              // mounted and fired inView during the jump, this ensures those
                              // initial IO events are ignored. Only real user scroll after
                              // this point will trigger loadNewer.
                              setTimeout(() => {
                                    isFetchingNewerRef.current = false;
                              }, 500);
                        }, 100);
                  } catch (err) {
                        console.error('[useChatMessages] jumpToMessage failed:', err);
                        isFetchingNewerRef.current = false;
                  } finally {
                        // Always flush buffered messages even if jump failed
                        isJumpingRef.current = false;
                        const buffered = jumpBufferRef.current;
                        jumpBufferRef.current = [];
                        if (buffered.length > 0) {
                              for (const msg of buffered) {
                                    queryClient.setQueryData<InfiniteData<CursorPaginatedResponse<MessageListItem>, string | undefined>>(
                                          queryKey,
                                          (prev) => {
                                                if (!prev) return prev;
                                                const allIds = new Set(prev.pages.flatMap((p) => p.data.map((m) => m.id)));
                                                if (allIds.has(msg.id)) return prev; // Already exists, skip
                                                const first = prev.pages[0];
                                                const nextFirstData = [msg, ...first.data].sort((a, b) => {
                                                      const aT = new Date(a.createdAt).getTime();
                                                      const bT = new Date(b.createdAt).getTime();
                                                      return bT - aT;
                                                });
                                                const nextPages = [...prev.pages];
                                                nextPages[0] = { ...first, data: nextFirstData };
                                                return { ...prev, pages: nextPages };
                                          },
                                    );
                              }
                        }
                        setTimeout(() => {
                              isFetchingOlderRef.current = false;
                              // isFetchingNewerRef is reset separately after scrollAndHighlight
                        }, 200);
                  }
            },
            [conversationId, limit, queryKey, queryClient, scrollAndHighlight, isFetchingOlderRef, isFetchingNewerRef],
      );

      // Ref for jumpToMessage — used in pending jump effect
      // to avoid re-running effect when jumpToMessage callback changes
      const jumpToMessageRef = useRef(jumpToMessage);
      jumpToMessageRef.current = jumpToMessage;

      // ============================================================================
      // Pending Jump Effect — execute jump when initial load completes
      // ============================================================================
      useEffect(() => {
            if (isInitialLoad) return;
            if (!pendingJumpRef.current) return;

            const targetId = pendingJumpRef.current;
            pendingJumpRef.current = null;

            // Small delay to ensure DOM has rendered after initial load
            setTimeout(() => {
                  void jumpToMessageRef.current(targetId);
            }, 50);
      }, [isInitialLoad]);

      const loadNewer = useCallback(async () => {
            if (!conversationId) return;
            if (!newerCursorRef.current) return;
            if (isFetchingNewerRef.current) return;

            isFetchingNewerRef.current = true;
            try {
                  const result = await messageService.getMessages({
                        conversationId,
                        cursor: newerCursorRef.current,
                        limit,
                        direction: 'newer',
                  });

                  const newMessages = result.data;
                  if (newMessages.length === 0) {
                        newerCursorRef.current = null;
                        setIsJumpedAway(false);
                        return;
                  }

                  // Update newer cursor: first item in DESC result = newest message
                  if (result.meta.hasNextPage && result.meta.nextCursor) {
                        newerCursorRef.current = result.meta.nextCursor;
                  } else {
                        newerCursorRef.current = null;
                        setIsJumpedAway(false);
                  }

                  // Prepend newer messages to pages[0] (they are newer = should come first in DESC)
                  queryClient.setQueryData<InfiniteData<CursorPaginatedResponse<MessageListItem>, string | undefined>>(
                        queryKey,
                        (prev) => {
                              if (!prev) return prev;
                              const existingIds = new Set(prev.pages.flatMap((p) => p.data.map((m) => m.id)));
                              const unique = newMessages.filter((m) => !existingIds.has(m.id));
                              if (unique.length === 0) return prev;

                              const first = prev.pages[0];
                              const merged = [...unique, ...first.data].sort((a, b) => {
                                    const aT = new Date(a.createdAt).getTime();
                                    const bT = new Date(b.createdAt).getTime();
                                    return bT - aT;
                              });
                              const nextPages = [...prev.pages];
                              nextPages[0] = { ...first, data: merged };
                              return { ...prev, pages: nextPages };
                        },
                  );
            } finally {
                  // Delay reset so the auto-scroll useEffects (which run after React
                  // re-renders from setQueryData) still see isFetchingNewerRef = true
                  // and skip scrollToBottom. Double-rAF ensures React has committed DOM.
                  requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                              isFetchingNewerRef.current = false;
                        });
                  });
            }
      }, [conversationId, limit, queryKey, queryClient, isFetchingNewerRef]);

      const returnToLatest = useCallback(async () => {
            if (!conversationId) return;
            setIsJumpedAway(false);
            newerCursorRef.current = null;
            // Remove current query data and refetch from scratch (latest messages)
            await queryClient.resetQueries({ queryKey });
            // After refetch, scroll to bottom
            requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                        scrollToBottom();
                  });
            });
      }, [conversationId, queryClient, queryKey, scrollToBottom]);

      return {
            jumpToMessage,
            loadNewer,
            returnToLatest,
            isJumpedAway,
            highlightedMessageId,
            isJumpingRef,
            jumpBufferRef,
            /** Must be synced with query.data by the orchestrator */
            queryDataRef,
      };
}
