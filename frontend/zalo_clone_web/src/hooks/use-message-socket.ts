import { useEffect, useRef } from 'react';
import type { InfiniteData, QueryKey, QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from './use-socket';
import { SocketEvents } from '@/constants/socket-events';
import type { CursorPaginatedResponse, MessageListItem, DirectReceipts } from '@/types/api';
import { useAuthStore } from '@/features/auth/stores/auth.store';

type SocketAck<T> = ({ error?: undefined } & T) | { error: string };

export type MessagesPage = CursorPaginatedResponse<MessageListItem>;
export type MessagesInfiniteData = InfiniteData<MessagesPage, string | undefined>;

type MessageNewPayload = { message: MessageListItem; conversationId: string };

type MessagesSyncPayload = { messages: MessageListItem[]; count: number };

type MessageSentAckPayload = {
  clientMessageId: string;
  serverMessageId: string;
  timestamp: string;
};

/** New hybrid receipt update payload (DIRECT per-message) */
type ReceiptUpdatePayload = {
  messageId: string;
  conversationId: string;
  userId: string;
  type: 'delivered' | 'seen';
  timestamp: string;
};

/** Group conversation read payload */
type ConversationReadPayload = {
  conversationId: string;
  userId: string;
  messageId: string | null;
  timestamp: string;
};

type TypingStatusPayload = {
  conversationId: string;
  userId: string;
  isTyping: boolean;
};

type SocketErrorPayload = {
  event?: string;
  clientMessageId?: string;
  error?: string;
  message?: string | object;
  code?: string;
};

function applySendFailedToCache(
  queryClient: QueryClient,
  queryKey: QueryKey,
  payload: SocketErrorPayload,
) {
  const clientMessageId = payload.clientMessageId;
  if (!clientMessageId) return;

  queryClient.setQueryData<MessagesInfiniteData>(queryKey, (prev) => {
    if (!prev) return prev;

    const pages = prev.pages.map((p) => ({
      ...p,
      data: p.data.map((m) => {
        if (!m.clientMessageId) return m;
        if (m.clientMessageId !== clientMessageId) return m;
        return {
          ...m,
          metadata: {
            ...(m.metadata ?? {}),
            sendStatus: 'FAILED',
            sendError: payload.error ?? 'Send failed',
          },
        };
      }),
    }));

    return { ...prev, pages };
  });
}

function upsertMessageToCache(
  queryClient: QueryClient,
  queryKey: QueryKey,
  message: MessageListItem,
) {
  queryClient.setQueryData<MessagesInfiniteData>(queryKey, (prev) => {
    if (!prev) {
      return {
        pages: [
          {
            data: [message],
            meta: { limit: 50, hasNextPage: false },
          },
        ],
        pageParams: [undefined],
      };
    }

    const isMatch = (m: MessageListItem) => {
      if (m.id === message.id) return true;
      if (!m.clientMessageId || !message.clientMessageId) return false;
      return m.clientMessageId === message.clientMessageId;
    };

    const foundExisting = prev.pages
      .flatMap((p) => p.data)
      .find((m) => isMatch(m));

    const merged: MessageListItem = foundExisting
      ? {
        ...foundExisting,
        ...message,
        metadata: {
          ...(foundExisting.metadata ?? {}),
          ...(message.metadata ?? {}),
        },
      }
      : message;

    const pagesWithoutDup = prev.pages.map((p) => ({
      ...p,
      data: p.data.filter((m) => !isMatch(m)),
    }));

    const first = pagesWithoutDup[0];
    const nextFirstData = [merged, ...first.data].sort((a, b) => {
      const aT = new Date(a.createdAt).getTime();
      const bT = new Date(b.createdAt).getTime();
      return bT - aT;
    });

    const nextPages = [...pagesWithoutDup];
    nextPages[0] = {
      ...first,
      data: nextFirstData,
    };

    return { ...prev, pages: nextPages };
  });
}

function applySentAckToCache(
  queryClient: QueryClient,
  queryKey: QueryKey,
  ack: MessageSentAckPayload,
) {
  queryClient.setQueryData<MessagesInfiniteData>(queryKey, (prev) => {
    if (!prev) return prev;

    const pages = prev.pages.map((p) => ({
      ...p,
      data: p.data.map((m) => {
        if (!m.clientMessageId) return m;
        if (m.clientMessageId !== ack.clientMessageId) return m;

        return {
          ...m,
          id: ack.serverMessageId,
          createdAt: ack.timestamp,
          updatedAt: ack.timestamp,
          metadata: {
            ...(m.metadata ?? {}),
            sendStatus: 'SENT',
          },
        };
      }),
    }));

    return { ...prev, pages };
  });
}

/**
 * Update directReceipts JSONB for a DIRECT message receipt event.
 * For DIRECT conversations, we update the per-user delivered/seen timestamps
 * AND increment the corresponding counters (deliveredCount/seenCount).
 * 
 * IMPORTANT: When marking as 'seen', backend MAY also set 'delivered' if null
 * (user read without explicit delivery ack). We mirror this logic here.
 * 
 * Returns the SAME reference if nothing actually changed (prevents unnecessary re-renders).
 */
function applyReceiptUpdateToCache(
  queryClient: QueryClient,
  queryKey: QueryKey,
  payload: ReceiptUpdatePayload,
) {
  queryClient.setQueryData<MessagesInfiniteData>(queryKey, (prev) => {
    if (!prev) return prev;

    let anyChange = false;

    const pages = prev.pages.map((p) => {
      let pageChanged = false;

      const data = p.data.map((m) => {
        if (m.id !== payload.messageId) return m;

        // Update directReceipts JSONB
        const current: DirectReceipts = (m.directReceipts as DirectReceipts) ?? {};
        const entry = current[payload.userId] ?? { delivered: null, seen: null };

        // Check if this is a new status update (to avoid double-counting)
        const hadNoDelivered = entry.delivered === null;
        const hadNoSeen = entry.seen === null;

        const isNewDelivered = payload.type === 'delivered' && hadNoDelivered;
        const isNewSeen = payload.type === 'seen' && hadNoSeen;

        // When marking as 'seen' without 'delivered', backend sets both
        const shouldBackfillDelivered = payload.type === 'seen' && hadNoDelivered;

        // If nothing new to update, return the SAME object reference
        if (!isNewDelivered && !isNewSeen && !shouldBackfillDelivered) {
          return m;
        }

        pageChanged = true;

        const updated: DirectReceipts = {
          ...current,
          [payload.userId]: {
            delivered: shouldBackfillDelivered ? payload.timestamp : (entry.delivered ?? (payload.type === 'delivered' ? payload.timestamp : null)),
            seen: payload.type === 'seen' ? payload.timestamp : entry.seen,
          },
        };

        return {
          ...m,
          directReceipts: updated,
          // Increment counters only for new status updates
          deliveredCount: (isNewDelivered || shouldBackfillDelivered)
            ? (m.deliveredCount ?? 0) + 1
            : (m.deliveredCount ?? 0),
          seenCount: isNewSeen
            ? (m.seenCount ?? 0) + 1
            : (m.seenCount ?? 0),
        };
      });

      if (!pageChanged) return p;
      anyChange = true;
      return { ...p, data };
    });

    // If nothing changed at all, return the SAME prev reference (no re-render)
    if (!anyChange) return prev;

    return { ...prev, pages };
  });
}

/**
 * Apply a group conversation:read event.
 * Increments seenCount for all messages up to the read messageId,
 * clamped at totalRecipients (R7).
 * Returns the SAME reference if nothing actually changed.
 */
function applyConversationReadToCache(
  queryClient: QueryClient,
  queryKey: QueryKey,
  payload: ConversationReadPayload,
) {
  if (!payload.messageId) return;

  queryClient.setQueryData<MessagesInfiniteData>(queryKey, (prev) => {
    if (!prev) return prev;

    // Find the target message to get its createdAt as a boundary
    const targetCreatedAt = (() => {
      for (const p of prev.pages) {
        const msg = p.data.find((m) => m.id === payload.messageId);
        if (msg) return msg.createdAt;
      }
      return null;
    })();
    if (!targetCreatedAt) return prev;

    let anyChange = false;

    const pages = prev.pages.map((p) => {
      let pageChanged = false;

      const data = p.data.map((m) => {
        // Only increment for messages <= the read message timestamp
        if (m.createdAt > targetCreatedAt) return m;

        const total = m.totalRecipients ?? 1;
        const currentSeen = m.seenCount ?? 0;
        // Clamp at totalRecipients (R7: prevent over-count)
        const nextSeen = Math.min(currentSeen + 1, total);

        // If already at max, no change needed — return same reference
        if (nextSeen === currentSeen) return m;

        pageChanged = true;
        return {
          ...m,
          seenCount: nextSeen,
        };
      });

      if (!pageChanged) return p;
      anyChange = true;
      return { ...p, data };
    });

    if (!anyChange) return prev;
    return { ...prev, pages };
  });
}

export function useMessageSocket(params: {
  conversationId: string | null;
  messagesQueryKey: QueryKey;
  onTypingStatus?: (payload: TypingStatusPayload) => void;
  // Approach A: Guard refs from useChatMessages to buffer messages during jump
  isJumpingRef?: React.RefObject<boolean>;
  jumpBufferRef?: React.MutableRefObject<MessageListItem[]>;
}) {
  const { conversationId, messagesQueryKey, onTypingStatus, isJumpingRef, jumpBufferRef } = params;
  const queryClient = useQueryClient();
  const { socket, isConnected } = useSocket();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const currentUserIdRef = useRef(currentUserId);
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const messagesQueryKeyRef = useRef(messagesQueryKey);
  useEffect(() => {
    messagesQueryKeyRef.current = messagesQueryKey;
  }, [messagesQueryKey]);

  const onTypingStatusRef = useRef(onTypingStatus);
  useEffect(() => {
    onTypingStatusRef.current = onTypingStatus;
  }, [onTypingStatus]);

  // Keep refs accessible in socket handlers - use useEffect to avoid updating refs during render
  const isJumpingRefCurrent = useRef(isJumpingRef);
  const jumpBufferRefCurrent = useRef(jumpBufferRef);

  useEffect(() => {
    isJumpingRefCurrent.current = isJumpingRef;
    jumpBufferRefCurrent.current = jumpBufferRef;
  }, [isJumpingRef, jumpBufferRef]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    const onMessageNew = (payload: MessageNewPayload) => {
      try {
        const currentConversationId = conversationIdRef.current;
        if (!currentConversationId) return;
        if (payload.conversationId !== currentConversationId) return;

        const senderId = payload.message.senderId ?? null;
        const myId = currentUserIdRef.current;
        if (socket && senderId && myId && senderId !== myId) {
          socket.emit(SocketEvents.MESSAGE_DELIVERED_ACK, {
            messageId: payload.message.id,
          });
        }

        // Approach A: Buffer messages during jump to avoid race condition
        const jumping = isJumpingRefCurrent.current?.current;
        const buffer = jumpBufferRefCurrent.current?.current;
        if (jumping && buffer) {
          buffer.push(payload.message);
          return;
        }

        upsertMessageToCache(queryClient, messagesQueryKeyRef.current, payload.message);
      } catch {
        // ignore handler errors
      }
    };

    const onMessagesSync = (payload: MessagesSyncPayload) => {
      try {
        const currentConversationId = conversationIdRef.current;
        if (!currentConversationId) return;

        // Approach A: Buffer messages during jump to avoid race condition
        const jumping = isJumpingRefCurrent.current?.current;
        const buffer = jumpBufferRefCurrent.current?.current;

        for (const m of payload.messages) {
          if (m.conversationId !== currentConversationId) continue;
          if (jumping && buffer) {
            buffer.push(m);
          } else {
            upsertMessageToCache(queryClient, messagesQueryKeyRef.current, m);
          }
        }
      } catch {
        // ignore handler errors
      }
    };

    const onSentAck = (payload: MessageSentAckPayload) => {
      try {
        applySentAckToCache(queryClient, messagesQueryKeyRef.current, payload);
      } catch {
        // ignore handler errors
      }
    };

    const onReceiptUpdate = (payload: ReceiptUpdatePayload) => {
      try {
        // DIRECT receipt updates — update directReceipts JSONB
        applyReceiptUpdateToCache(queryClient, messagesQueryKeyRef.current, payload);
      } catch {
        // ignore handler errors
      }
    };

    const onConversationRead = (payload: ConversationReadPayload) => {
      try {
        const currentConversationId = conversationIdRef.current;
        if (!currentConversationId) return;
        if (payload.conversationId !== currentConversationId) return;
        // GROUP read — increment seenCount
        applyConversationReadToCache(queryClient, messagesQueryKeyRef.current, payload);
      } catch {
        // ignore handler errors
      }
    };

    const onSocketError = (payload: SocketErrorPayload) => {
      try {
        if (payload.event !== SocketEvents.MESSAGE_SEND) return;
        const errorMsg = typeof payload.error === 'string'
          ? payload.error
          : (typeof payload.message === 'string' ? payload.message : 'Send failed');
        applySendFailedToCache(queryClient, messagesQueryKeyRef.current, {
          ...payload,
          error: errorMsg,
        });
      } catch {
        // ignore handler errors
      }
    };

    const onTypingStatusEvent = (payload: TypingStatusPayload) => {
      try {
        const handler = onTypingStatusRef.current;
        if (!handler) return;
        const currentConversationId = conversationIdRef.current;
        if (!currentConversationId) return;
        if (payload.conversationId !== currentConversationId) return;
        handler(payload);
      } catch {
        // ignore handler errors
      }
    };

    socket.on(SocketEvents.MESSAGE_NEW, onMessageNew);
    socket.on(SocketEvents.MESSAGES_SYNC, onMessagesSync);
    socket.on(SocketEvents.MESSAGE_SENT_ACK, onSentAck);
    socket.on(SocketEvents.MESSAGE_RECEIPT_UPDATE, onReceiptUpdate);
    socket.on(SocketEvents.CONVERSATION_READ, onConversationRead);
    socket.on(SocketEvents.ERROR, onSocketError);
    socket.on(SocketEvents.TYPING_STATUS, onTypingStatusEvent);

    return () => {
      socket.off(SocketEvents.MESSAGE_NEW, onMessageNew);
      socket.off(SocketEvents.MESSAGES_SYNC, onMessagesSync);
      socket.off(SocketEvents.MESSAGE_SENT_ACK, onSentAck);
      socket.off(SocketEvents.MESSAGE_RECEIPT_UPDATE, onReceiptUpdate);
      socket.off(SocketEvents.CONVERSATION_READ, onConversationRead);
      socket.off(SocketEvents.ERROR, onSocketError);
      socket.off(SocketEvents.TYPING_STATUS, onTypingStatusEvent);
    };
  }, [socket, isConnected, queryClient]);

  return {
    isConnected,
    emitDelivered: (messageId: string) => {
      if (!socket) return;
      socket.emit(SocketEvents.MESSAGE_DELIVERED_ACK, { messageId });
    },
    emitMarkAsSeen: (dto: { conversationId: string; messageIds: string[] }) => {
      if (!socket) return;
      socket.emit(SocketEvents.MESSAGE_SEEN, dto);
    },
    emitSendMessage: <T extends Record<string, unknown>>(
      dto: T,
      ack?: (response: SocketAck<{ messageId: string }>) => void,
    ) => {
      if (!socket) return;
      socket.emit(SocketEvents.MESSAGE_SEND, dto, ack);
    },
    emitTypingStart: (dto: { conversationId: string }) => {
      if (!socket) return;
      socket.emit(SocketEvents.TYPING_START, { ...dto, isTyping: true });
    },
    emitTypingStop: (dto: { conversationId: string }) => {
      if (!socket) return;
      socket.emit(SocketEvents.TYPING_STOP, { ...dto, isTyping: false });
    },
  };
}
