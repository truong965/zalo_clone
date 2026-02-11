import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import type { CursorPaginatedResponse, MessageListItem, MessageType } from '@/types/api';
import { messageService } from '@/services/message.service';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import type { ChatMessage } from '../types';

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function mapMessageToUI(m: MessageListItem, currentUserId: string | null): ChatMessage {
  const senderSide = currentUserId && m.senderId === currentUserId ? 'me' : 'other';
  const senderName = m.sender?.displayName;
  const avatar = m.sender?.avatarUrl ?? undefined;
  const displayTimestamp = m.createdAt ? formatTime(m.createdAt) : undefined;

  return {
    ...m,
    senderSide,
    senderName,
    avatar,
    displayTimestamp,
  };
}

export function useChatMessages(params: {
  conversationId: string | null;
  limit?: number;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { conversationId, limit = 50, messagesContainerRef } = params;
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const queryClient = useQueryClient();
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isJumpedAway, setIsJumpedAway] = useState(false);

  // ============================================================================
  // Pending Jump — lưu intent jump-to-message khi conversation chưa ready
  // Khi user click search result từ global search → setSelectedId(convId) +
  // jumpToMessage(msgId) gọi đồng thời. Lúc này useInfiniteQuery chưa có data
  // (isInitialLoad = true). pendingJumpRef lưu targetMessageId, và useEffect
  // bên dưới sẽ thực thi jump khi initial load hoàn tất.
  // ============================================================================
  const pendingJumpRef = useRef<string | null>(null);

  // FIX 1: scrollSnapshotRef chỉ được dùng bởi loadOlder, KHÔNG còn trong queryFn.
  // Snapshot sẽ được chụp ngay trước khi gọi fetchNextPage để đảm bảo
  // scrollHeight và scrollTop là chính xác tại thời điểm đó.
  const scrollSnapshotRef = useRef({ scrollHeight: 0, scrollTop: 0 });

  // FIX 2: Dùng ref để track trạng thái "đang fetch older messages".
  // useEffect scrollToBottom sẽ đọc ref này để tránh scrollToBottom
  // đè lên preserveScrollAfterPrepend.
  const isFetchingOlderRef = useRef(false);
  const isFetchingNewerRef = useRef(false);

  // Cursor for fetching newer messages (scroll down after jump)
  const newerCursorRef = useRef<string | null>(null);

  // ============================================================================
  // Jump Guard — shared ref cho use-message-socket biết khi jumpToMessage đang chạy.
  // Khi isJumpingRef = true, socket handler sẽ buffer messages thay vì upsert ngay
  // để tránh race condition giữa context replacement và socket events.
  // ============================================================================
  const isJumpingRef = useRef(false);
  const jumpBufferRef = useRef<MessageListItem[]>([]);

  const queryKey = useMemo(
    () => ['messages', { conversationId, limit }] as const,
    [conversationId, limit],
  );

  const query = useInfiniteQuery({
    queryKey,
    enabled: !!conversationId,
    initialPageParam: undefined as string | undefined,
    // FIX 1: Đã XÓA việc chụp scrollSnapshot trong queryFn.
    // queryFn là async và kéo dài 200-500ms. Trong thời gian đó user
    // vẫn scroll, khiến scrollTop thay đổi. Snapshot cũ → tính toán sai.
    queryFn: async ({ pageParam }) => {
      if (!conversationId) {
        return { data: [], meta: { limit, hasNextPage: false } };
      }
      return messageService.getMessages({
        conversationId,
        cursor: pageParam,
        limit,
      });
    },
    getNextPageParam: (lastPage) => {
      return lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined;
    },
    // Approach C: Messages được cập nhật real-time qua socket events.
    // Disable auto-refetch để tránh race condition gây duplicate + giảm backend load.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const messagesDesc = (query.data?.pages ?? []).flatMap((p) => p.data);
  const newestMessageId = messagesDesc[0]?.id ?? null;

  // Approach D: Dedup layer — safety net ngăn duplicate key React error.
  // Nếu race condition vẫn tạo duplicate (edge case), layer này sẽ filter.
  const messagesAsc = useMemo(() => {
    const asc = [...messagesDesc].reverse();
    const seen = new Set<string>();
    const deduped = asc.filter((m) => {
      if (seen.has(m.id)) {
        return false;
      }
      seen.add(m.id);
      return true;
    });
    return deduped.map((m) => mapMessageToUI(m, currentUserId));
  }, [messagesDesc, currentUserId]);

  const preserveScrollAfterPrepend = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollHeight: oldScrollHeight, scrollTop: oldScrollTop } =
      scrollSnapshotRef.current;
    const newScrollHeight = container.scrollHeight;
    const heightDifference = newScrollHeight - oldScrollHeight;

    // Gán trực tiếp, không dùng rAF ở đây vì caller đã wrap trong rAF.
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

  useEffect(() => {
    if (!conversationId) return;
    queueMicrotask(() => setIsInitialLoad(true));
    queueMicrotask(() => {
      setNewMessageCount(0);
      setIsAtBottom(true);
      setHighlightedMessageId(null);
      setIsJumpedAway(false);
    });
    // Không clear pendingJumpRef ở đây — nó được set TRƯỚC khi conversationId thay đổi
    // và cần tồn tại cho đến khi initial load hoàn tất.
  }, [conversationId]);

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
  }, [conversationId, newestMessageId, isAtBottom, isInitialLoad, scrollToBottom]);

  useEffect(() => {
    if (!conversationId) return;
    if (!query.data) return;

    // FIX 2: Nếu đang fetch older messages, effect này KHÔNG được chạy scrollToBottom.
    // Việc restore scroll position đã được xử lý hoàn toàn trong loadOlder().
    if (isFetchingOlderRef.current) return;
    // Same for newer messages — user is scrolling through jumped-to context.
    if (isFetchingNewerRef.current) return;

    // Chỉ auto-scroll khi initial load hoặc user đang ở bottom.
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
  }, [conversationId, query.data, scrollToBottom, isInitialLoad, isAtBottom]);

  // Refs to access latest state without re-creating callback
  const queryRef = useRef(query);
  queryRef.current = query;
  const isInitialLoadRef = useRef(isInitialLoad);
  isInitialLoadRef.current = isInitialLoad;

  const loadOlder = useCallback(async () => {
    if (isFetchingOlderRef.current) return;
    if (isInitialLoadRef.current) return;
    const q = queryRef.current;
    if (!q.hasNextPage || q.isFetchingNextPage) return;

    // FIX 1: Chụp snapshot NGAY TẠI ĐÂY — đồng bộ, trước khi fetch bắt đầu.
    // Lúc này scrollHeight và scrollTop là chính xác 100%,
    // không bị ảnh hưởng bởi độ trễ của API call.
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

      // FIX 3: Dùng double requestAnimationFrame để đảm bảo React đã commit
      // DOM mới hoàn toàn trước khi tính toán lại scroll position.
      // 1 rAF đôi khi chạy trước khi React paint xong → scrollHeight chưa đúng.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          preserveScrollAfterPrepend();
        });
      });
    } finally {
      // Reset flag sau khi cả scroll restore lẫn DOM paint đã hoàn tất.
      // Dùng setTimeout để chắc chắn rAF chain ở trên đã chạy xong.
      setTimeout(() => {
        isFetchingOlderRef.current = false;
      }, 0);
    }
  }, [preserveScrollAfterPrepend, messagesContainerRef]);

  const buildSendTextDto = useCallback(
    (text: string) => {
      if (!conversationId) return null;
      const dto: {
        conversationId: string;
        clientMessageId: string;
        type: MessageType;
        content: string;
      } = {
        conversationId,
        clientMessageId: crypto.randomUUID(),
        type: 'TEXT' as MessageType,
        content: text,
      };

      return dto;
    },
    [conversationId],
  );

  // ============================================================================
  // jumpToMessage — Scroll to and highlight a specific message
  //
  // 3 cases:
  //   A) Conversation chưa ready (isInitialLoad || !query.data) → lưu pendingJumpRef
  //   B) Message đã loaded trong query data → scroll + highlight
  //   C) Message chưa loaded → fetch context API, replace query data, scroll + highlight
  // ============================================================================

  // Helper: scroll to DOM element + highlight (không phụ thuộc state nào ngoài refs)
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

  // Ref-based access to avoid re-creating jumpToMessage when query.data changes
  const queryDataRef = useRef(query.data);
  queryDataRef.current = query.data;

  const jumpToMessage = useCallback(
    async (targetMessageId: string) => {
      if (!conversationId) return;

      // Case A: Conversation chưa sẵn sàng → lưu pending intent
      // useEffect bên dưới sẽ pick up khi isInitialLoad → false
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
      // Set flags để chặn scroll effects + guard socket upserts.
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
        // This avoids the "gap" problem where merge creates a single page
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
        // Approach A: LUÔN flush buffered messages kể cả khi jump thất bại
        isJumpingRef.current = false;
        const buffered = jumpBufferRef.current;
        jumpBufferRef.current = [];
        if (buffered.length > 0) {
          for (const msg of buffered) {
            // Re-import not needed — upsert is in use-message-socket.
            // Trigger cache update by emitting a custom event or directly setting data.
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
    [conversationId, limit, queryKey, queryClient, scrollAndHighlight],
  );

  // Ref cho jumpToMessage — dùng trong useEffect pending jump
  // để tránh re-run effect khi jumpToMessage callback thay đổi
  const jumpToMessageRef = useRef(jumpToMessage);
  jumpToMessageRef.current = jumpToMessage;

  // ============================================================================
  // Pending Jump Effect — thực thi jump khi initial load hoàn tất
  // ============================================================================
  useEffect(() => {
    if (isInitialLoad) return;
    if (!pendingJumpRef.current) return;

    const targetId = pendingJumpRef.current;
    pendingJumpRef.current = null;

    // Delay nhỏ để đảm bảo DOM đã render xong sau initial load
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
  }, [conversationId, limit, queryKey, queryClient]);

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
    // Approach A: Expose jump guard refs for use-message-socket
    isJumpingRef,
    jumpBufferRef,
    isFetchingNewerRef,
  };
}

export type MessagesQueryData = InfiniteData<CursorPaginatedResponse<MessageListItem>, string | undefined>;