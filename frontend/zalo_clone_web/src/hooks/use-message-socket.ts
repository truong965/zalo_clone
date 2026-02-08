import { useEffect, useRef } from 'react';
import type { InfiniteData, QueryKey, QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from './use-socket';
import { SocketEvents } from '@/constants/socket-events';
import type { CursorPaginatedResponse, MessageListItem, ReceiptStatus } from '@/types/api';
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

type ReceiptUpdatePayload = {
  messageId: string;
  userId: string;
  status: ReceiptStatus;
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

function applyReceiptUpdateToCache(
  queryClient: QueryClient,
  queryKey: QueryKey,
  payload: ReceiptUpdatePayload,
) {
  queryClient.setQueryData<MessagesInfiniteData>(queryKey, (prev) => {
    if (!prev) return prev;

    const pages = prev.pages.map((p) => ({
      ...p,
      data: p.data.map((m) => {
        if (m.id !== payload.messageId) return m;
        const receipts = m.receipts ?? [];
        const existingIdx = receipts.findIndex((r) => r.userId === payload.userId);

        const updatedReceipt = {
          userId: payload.userId,
          status: payload.status,
          timestamp: payload.timestamp,
        };

        let nextReceipts: typeof receipts;
        if (existingIdx === -1) {
          nextReceipts = [...receipts, updatedReceipt];
        } else {
          nextReceipts = receipts.map((r, i) => (i === existingIdx ? updatedReceipt : r));
        }

        return {
          ...m,
          receipts: nextReceipts,
        };
      }),
    }));

    return { ...prev, pages };
  });
}

export function useMessageSocket(params: {
  conversationId: string | null;
  messagesQueryKey: QueryKey;
  onTypingStatus?: (payload: TypingStatusPayload) => void;
}) {
  const { conversationId, messagesQueryKey, onTypingStatus } = params;
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

        upsertMessageToCache(queryClient, messagesQueryKeyRef.current, payload.message);
      } catch {
        // ignore handler errors
      }
    };

    const onMessagesSync = (payload: MessagesSyncPayload) => {
      try {
        const currentConversationId = conversationIdRef.current;
        if (!currentConversationId) return;

        for (const m of payload.messages) {
          if (m.conversationId !== currentConversationId) continue;
          upsertMessageToCache(queryClient, messagesQueryKeyRef.current, m);
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
        applyReceiptUpdateToCache(queryClient, messagesQueryKeyRef.current, payload);
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
    socket.on(SocketEvents.ERROR, onSocketError);
    socket.on(SocketEvents.TYPING_STATUS, onTypingStatusEvent);

    return () => {
      socket.off(SocketEvents.MESSAGE_NEW, onMessageNew);
      socket.off(SocketEvents.MESSAGES_SYNC, onMessagesSync);
      socket.off(SocketEvents.MESSAGE_SENT_ACK, onSentAck);
      socket.off(SocketEvents.MESSAGE_RECEIPT_UPDATE, onReceiptUpdate);
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
