/**
 * useScrollManager — Manages scroll position tracking, auto-scroll, and
 * scroll preservation for the messages container.
 *
 * Extracted from useChatMessages. All logic preserved exactly as-is.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function useScrollManager(params: {
      conversationId: string | null;
      messagesContainerRef: React.RefObject<HTMLDivElement | null>;
      newestMessageId: string | null;
      /** Used as an effect dependency trigger only (identity check). */
      queryData: unknown;
      isInitialLoad: boolean;
      setIsInitialLoad: (value: boolean) => void;
      isFetchingOlderRef: React.MutableRefObject<boolean>;
      isFetchingNewerRef: React.MutableRefObject<boolean>;
}) {
      const {
            conversationId,
            messagesContainerRef,
            newestMessageId,
            queryData,
            isInitialLoad,
            setIsInitialLoad,
            isFetchingOlderRef,
            isFetchingNewerRef,
      } = params;

      const [isAtBottom, setIsAtBottom] = useState(true);
      const [newMessageCount, setNewMessageCount] = useState(0);

      // FIX 1: scrollSnapshotRef — only used by loadOlder, NOT in queryFn.
      // Snapshot is captured synchronously right before fetchNextPage.
      const scrollSnapshotRef = useRef({ scrollHeight: 0, scrollTop: 0 });

      const preserveScrollAfterPrepend = useCallback(() => {
            const container = messagesContainerRef.current;
            if (!container) return;

            const { scrollHeight: oldScrollHeight, scrollTop: oldScrollTop } =
                  scrollSnapshotRef.current;
            const newScrollHeight = container.scrollHeight;
            const heightDifference = newScrollHeight - oldScrollHeight;

            // Assign directly — caller already wraps in rAF.
            container.scrollTop = oldScrollTop + heightDifference;
      }, [messagesContainerRef]);

      const scrollToBottom = useCallback(() => {
            const container = messagesContainerRef.current;
            if (!container) return;
            requestAnimationFrame(() => {
                  container.scrollTop = container.scrollHeight;
            });
      }, [messagesContainerRef]);

      const clearNewMessageCount = useCallback(() => {
            setNewMessageCount(0);
      }, []);

      // ── Reset on conversation change ───────────────────────────────────
      useEffect(() => {
            if (!conversationId) return;
            queueMicrotask(() => {
                  setNewMessageCount(0);
                  setIsAtBottom(true);
            });
      }, [conversationId]);

      // ── Scroll listener — track isAtBottom ─────────────────────────────
      useEffect(() => {
            const container = messagesContainerRef.current;
            if (!container) return;

            const thresholdPx = 40;
            const computeIsAtBottom = () => {
                  const distance = container.scrollHeight - (container.scrollTop + container.clientHeight);
                  const atBottom = distance <= thresholdPx;
                  setIsAtBottom(atBottom);
                  if (atBottom) setNewMessageCount(0);
            };

            computeIsAtBottom();
            container.addEventListener('scroll', computeIsAtBottom, { passive: true });
            return () => {
                  container.removeEventListener('scroll', computeIsAtBottom);
            };
      }, [messagesContainerRef, conversationId]);

      // ── Track new messages arriving (newest message id changes) ────────
      const prevNewestMessageIdRef = useRef<string | null>(null);
      useEffect(() => {
            if (!conversationId) return;
            if (!newestMessageId) return;
            if (isInitialLoad) {
                  prevNewestMessageIdRef.current = newestMessageId;
                  return;
            }

            const prev = prevNewestMessageIdRef.current;
            if (prev === newestMessageId) return;
            prevNewestMessageIdRef.current = newestMessageId;

            // When loadNewer inserts messages, newestMessageId changes but we must
            // NOT auto-scroll — the user is reading older messages after a jump.
            if (isFetchingNewerRef.current) return;

            if (isAtBottom) {
                  scrollToBottom();
                  return;
            }

            queueMicrotask(() => setNewMessageCount((c) => c + 1));
      }, [conversationId, newestMessageId, isAtBottom, isInitialLoad, scrollToBottom, isFetchingNewerRef]);

      // ── Auto-scroll on data change (initial load + bottom) ─────────────
      useEffect(() => {
            if (!conversationId) return;
            if (!queryData) return;

            // FIX 2: Skip if fetching older — scroll restore handled by loadOlder.
            if (isFetchingOlderRef.current) return;
            // Same for newer — user is scrolling through jumped-to context.
            if (isFetchingNewerRef.current) return;

            // Only auto-scroll on initial load or when user is at bottom.
            if (!isInitialLoad && !isAtBottom) {
                  return;
            }

            requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                        scrollToBottom();
                        if (isInitialLoad) {
                              setTimeout(() => setIsInitialLoad(false), 200);
                        }
                  });
            });
      }, [conversationId, queryData, scrollToBottom, isInitialLoad, isAtBottom, isFetchingOlderRef, isFetchingNewerRef, setIsInitialLoad]);

      return {
            isAtBottom,
            scrollToBottom,
            newMessageCount,
            clearNewMessageCount,
            preserveScrollAfterPrepend,
            scrollSnapshotRef,
      };
}
