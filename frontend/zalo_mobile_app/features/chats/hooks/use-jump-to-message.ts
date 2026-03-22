import { useCallback, useRef, useState } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { Message } from '@/types/message';
import { useAuth } from '@/providers/auth-provider';
// FIX Bug 1: Import messagesQueryKey để dùng đúng key — không nhận queryKey từ ngoài vào
// vì _id_.tsx đã từng truyền object key khác với key mà useMessagesList dùng.
import { messagesQueryKey } from './use-chat-hooks';

type MessagesPage = { data: Message[]; meta: { nextCursor?: string; hasNextPage: boolean } };
type MessagesInfiniteData = InfiniteData<MessagesPage, string | undefined>;

const CONTEXT_BEFORE = 10;
const CONTEXT_AFTER = 30;

export function useJumpToMessage(params: {
  conversationId: string;
  flashListRef: React.RefObject<any>;
  scrollToBottom: () => void;
}) {
  const { conversationId, flashListRef, scrollToBottom } = params;
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  // FIX Bug 1: Dùng đúng queryKey — cùng key với useMessagesList và useChatRealtime.
  // Trước đây _id_.tsx truyền vào ['messages', { conversationId, direction }] (object)
  // nhưng useMessagesList dùng ['messages', conversationId, 'older'] (string tuple).
  // TanStack Query so sánh key bằng deep equality → 2 key trên là 2 cache slot khác nhau.
  // Hệ quả: getQueryData trả về undefined → luôn contextual jump dù message đã load,
  //          setQueryData ghi vào slot không ai đọc → FlashList không re-render.
  const queryKey = messagesQueryKey(conversationId, 'older');

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [isJumpedAway, setIsJumpedAway] = useState(false);
  const [isFetchingNewer, setIsFetchingNewer] = useState(false);
  const [isJumping, setIsJumping] = useState(false);

  const [flashListKey, setFlashListKey] = useState('normal');
  const [initialScrollIndex, setInitialScrollIndex] = useState<number | undefined>(undefined);

  const newerCursorRef = useRef<string | null>(null);

  // FIX Bug 2: Socket guard — giống hệt pattern của web.
  // isJumpingRef: useChatRealtime đọc ref này để quyết định có upsert ngay không.
  // jumpBufferRef: messages nhận trong lúc jump được buffer, flush sau khi jump xong.
  //
  // Tại sao cần ref thay vì state?
  //   - Phải readable từ closure của socket handler (useEffect) mà không stale.
  //   - Không trigger re-render khi thay đổi.
  //   - Được đọc synchronously trong handler → ref là cách duy nhất đúng.
  const isJumpingRef = useRef(false);
  const jumpBufferRef = useRef<Message[]>([]);

  // ─── jumpToMessage ──────────────────────────────────────────────────────────
  const jumpToMessage = useCallback(async (targetId: string) => {
    if (!accessToken || !conversationId || isJumpingRef.current) return;

    // Set cả ref (đọc bởi socket handler) lẫn state (UI loading indicator)
    isJumpingRef.current = true;
    jumpBufferRef.current = [];
    setIsJumping(true);

    try {
      const data = queryClient.getQueryData<MessagesInfiniteData>(queryKey);
      const allMessages = data?.pages
        .flatMap(p => p.data)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        ?? [];

      const targetIndex = allMessages.findIndex(
        m => m.id === targetId || m.id.toString() === targetId.toString(),
      );

      if (targetIndex !== -1) {
        // Case B: Message đã có trong cache và layout đã đo → scroll trực tiếp.
        // isJumpingRef vẫn = true ở đây vì chưa finally → socket vẫn buffer.
        // Nhưng case này không async nên thời gian rất ngắn, buffer sẽ flush ngay.
        const layout = flashListRef.current?.getLayout(targetIndex);
        if (layout) {
          const windowSize = flashListRef.current?.getWindowSize();
          const centeringOffset = windowSize ? (windowSize.height - layout.height) / 2 : 0;
          flashListRef.current?.scrollToOffset({
            offset: Math.max(0, layout.y - centeringOffset),
            animated: true,
            skipFirstItemOffset: false,
          });
          setHighlightedId(targetId);
          setTimeout(() => setHighlightedId(null), 2500);
          return;
        }
      }

      // Case C: Contextual jump — fetch context từ server
      const context = await mobileApi.getMessageContext(
        conversationId, accessToken, targetId, CONTEXT_BEFORE, CONTEXT_AFTER,
      );

      const sorted = [...context.data].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const reversed = [...sorted].reverse();

      const targetIndexInContext = sorted.findIndex(
        m => m.id.toString() === targetId.toString(),
      );
      const scrollToIdx = targetIndexInContext !== -1 ? targetIndexInContext : CONTEXT_BEFORE;

      const contextPage: MessagesPage = {
        data: reversed,
        meta: {
          hasNextPage: context.hasOlderMessages,
          nextCursor: context.hasOlderMessages && reversed.length > 0
            ? reversed[reversed.length - 1].id.toString()
            : undefined,
        },
      };

      newerCursorRef.current = context.hasNewerMessages && sorted.length > 0
        ? sorted[sorted.length - 1].id.toString()
        : null;

      setInitialScrollIndex(scrollToIdx);
      queryClient.setQueryData<MessagesInfiniteData>(queryKey, () => ({
        pages: [contextPage],
        pageParams: [undefined],
      }));
      setFlashListKey(`jump-${targetId}-${Date.now()}`);

      setIsJumpedAway(true);
      if (!context.hasNewerMessages) setIsJumpedAway(false);

      requestAnimationFrame(() => {
        setHighlightedId(targetId);
        setTimeout(() => setHighlightedId(null), 2500);
      });

    } catch (error) {
      console.error('[useJumpToMessage] Jump failed:', error);
    } finally {
      // FIX Bug 2: Reset jump guard và flush buffered socket messages.
      // Giống web: buffered messages được upsert vào cache sau khi setQueryData xong,
      // đảm bảo không mất tin nhắn nhận trong lúc jump đang xử lý.
      isJumpingRef.current = false;
      setIsJumping(false);

      const buffered = jumpBufferRef.current;
      jumpBufferRef.current = [];

      for (const msg of buffered) {
        queryClient.setQueryData<MessagesInfiniteData>(queryKey, (prev) => {
          if (!prev) return prev;
          const allIds = new Set(prev.pages.flatMap(p => p.data.map(m => m.id)));
          if (allIds.has(msg.id)) return prev; // dedup
          const first = prev.pages[0];
          const updated = [msg, ...first.data].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
          const newPages = [...prev.pages];
          newPages[0] = { ...first, data: updated };
          return { ...prev, pages: newPages };
        });
      }
    }
  }, [accessToken, conversationId, flashListRef, queryClient, queryKey]);

  // ─── loadNewer ──────────────────────────────────────────────────────────────
  const loadNewer = useCallback(async () => {
    if (!accessToken || !conversationId || !newerCursorRef.current || isFetchingNewer) return;

    setIsFetchingNewer(true);
    try {
      const result = await mobileApi.getMessages(
        conversationId, accessToken, newerCursorRef.current, 'newer', 20,
      );

      if (result.data.length === 0) {
        newerCursorRef.current = null;
        setIsJumpedAway(false);
        return;
      }

      newerCursorRef.current = result.meta.hasNextPage ? result.meta.nextCursor || null : null;
      if (!result.meta.hasNextPage) setIsJumpedAway(false);

      queryClient.setQueryData<MessagesInfiniteData>(queryKey, (prev) => {
        if (!prev) return prev;
        const firstPage = prev.pages[0];
        const existingIds = new Set(firstPage.data.map(m => m.id));
        const uniqueNew = result.data.filter((m: Message) => !existingIds.has(m.id));
        const combined = [...uniqueNew, ...firstPage.data].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        const newPages = [...prev.pages];
        newPages[0] = { ...firstPage, data: combined };
        return { ...prev, pages: newPages };
      });
    } catch (error) {
      console.error('[useJumpToMessage] loadNewer failed:', error);
    } finally {
      setIsFetchingNewer(false);
    }
  }, [accessToken, conversationId, isFetchingNewer, queryClient, queryKey]);

  // ─── returnToLatest ─────────────────────────────────────────────────────────
  const returnToLatest = useCallback(async () => {
    setIsJumpedAway(false);
    newerCursorRef.current = null;
    setInitialScrollIndex(undefined);
    await queryClient.resetQueries({ queryKey });
    setFlashListKey('normal');
    setTimeout(() => scrollToBottom(), 100);
  }, [queryClient, queryKey, scrollToBottom]);

  return {
    jumpToMessage,
    loadNewer,
    returnToLatest,
    isJumpedAway,
    highlightedId,
    isFetchingNewer,
    isJumping,
    flashListKey,
    initialScrollIndex,
    // FIX Bug 2: Export để _id_.tsx truyền vào useChatRealtime
    isJumpingRef,
    jumpBufferRef,
  };
}
