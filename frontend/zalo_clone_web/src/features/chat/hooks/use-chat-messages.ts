/**
 * useChatMessages — Thin orchestrator composing sub-hooks.
 *
 * Sub-hooks handle their own concerns:
 *   - useMessageQuery    — infinite query + dedup/mapping
 *   - useScrollManager   — scroll tracking + auto-scroll effects
 *   - useJumpToMessage   — jump-to-message (3 cases), loadNewer, returnToLatest
 *
 * This orchestrator owns shared state (isInitialLoad) and shared refs
 * (isFetchingOlderRef, isFetchingNewerRef), and provides loadOlder which
 * bridges query + scroll concerns.
 *
 * Return interface is identical to the original monolith — no consumer changes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InfiniteData } from '@tanstack/react-query';
import type { CursorPaginatedResponse, MessageListItem } from '@/types/api';
import { useAuthStore } from '@/features/auth';
import { useMessageQuery } from './use-message-query';
import { useScrollManager } from './use-scroll-manager';
import { useJumpToMessage } from './use-jump-to-message';

export function useChatMessages(params: {
  conversationId: string | null;
  limit?: number;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { conversationId, limit = 50, messagesContainerRef } = params;
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  // ── Shared state owned by orchestrator ─────────────────────────────
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const isFetchingOlderRef = useRef(false);
  const isFetchingNewerRef = useRef(false);

  // ── Sub-hook: Message query ────────────────────────────────────────
  const { query, queryKey, messagesAsc, newestMessageId, buildSendTextDto } = useMessageQuery({
    conversationId,
    limit,
    currentUserId,
  });

  // ── Sub-hook: Scroll manager ───────────────────────────────────────
  const {
    isAtBottom,
    scrollToBottom,
    newMessageCount,
    clearNewMessageCount,
    preserveScrollAfterPrepend,
    scrollSnapshotRef,
  } = useScrollManager({
    conversationId,
    messagesContainerRef,
    newestMessageId,
    queryData: query.data,
    isInitialLoad,
    setIsInitialLoad,
    isFetchingOlderRef,
    isFetchingNewerRef,
  });

  // ── Sub-hook: Jump to message ──────────────────────────────────────
  const {
    jumpToMessage,
    loadNewer,
    returnToLatest,
    isJumpedAway,
    highlightedMessageId,
    isJumpingRef,
    jumpBufferRef,
    queryDataRef,
  } = useJumpToMessage({
    conversationId,
    limit,
    queryKey,
    messagesContainerRef,
    isInitialLoad,
    isFetchingOlderRef,
    isFetchingNewerRef,
    scrollToBottom,
  });

  // Sync query data to jump hook's ref — avoids re-creating jumpToMessage
  // callback whenever query.data changes (would trigger effect cascades).
  queryDataRef.current = query.data;

  // ── Reset on conversation change ───────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;
    queueMicrotask(() => setIsInitialLoad(true));
  }, [conversationId]);

  // ── Ref-based query access for loadOlder ───────────────────────────
  const queryRef = useRef(query);
  queryRef.current = query;
  const isInitialLoadRef = useRef(isInitialLoad);
  isInitialLoadRef.current = isInitialLoad;

  // ── loadOlder — bridges query + scroll concerns ────────────────────
  const loadOlder = useCallback(async () => {
    if (isFetchingOlderRef.current) return;
    if (isInitialLoadRef.current) return;
    const q = queryRef.current;
    if (!q.hasNextPage || q.isFetchingNextPage) return;

    // FIX 1: Capture snapshot HERE — synchronous, before fetch starts.
    // scrollHeight and scrollTop are 100% accurate at this point,
    // not affected by API call latency.
    const container = messagesContainerRef.current;
    if (container) {
      scrollSnapshotRef.current = {
        scrollHeight: container.scrollHeight,
        scrollTop: container.scrollTop,
      };
    }

    isFetchingOlderRef.current = true;
    try {
      await q.fetchNextPage();

      // FIX 3: Double requestAnimationFrame ensures React has fully committed
      // new DOM before recalculating scroll position.
      // Single rAF sometimes runs before React paint → incorrect scrollHeight.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          preserveScrollAfterPrepend();
        });
      });
    } finally {
      // Reset flag after scroll restore + DOM paint have completed.
      // setTimeout ensures the rAF chain above has run.
      setTimeout(() => {
        isFetchingOlderRef.current = false;
      }, 0);
    }
  }, [preserveScrollAfterPrepend, messagesContainerRef, scrollSnapshotRef]);

  return {
    queryKey,
    query,
    messages: messagesAsc,
    isInitialLoad,
    isAtBottom,
    isJumpedAway,
    newMessageCount,
    highlightedMessageId,
    clearNewMessageCount,
    scrollToBottom,
    loadOlder,
    loadNewer,
    jumpToMessage,
    returnToLatest,
    buildSendTextDto,
    // Expose jump guard refs for use-message-socket
    isJumpingRef,
    jumpBufferRef,
    isFetchingNewerRef,
  };
}

export type MessagesQueryData = InfiniteData<CursorPaginatedResponse<MessageListItem>, string | undefined>;
