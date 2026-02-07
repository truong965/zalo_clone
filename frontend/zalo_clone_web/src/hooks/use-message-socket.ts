import { useEffect, useRef } from 'react';
import type { InfiniteData, QueryKey, QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from './use-socket';
import { SocketEvents } from '@/constants/socket-events';
import type { CursorPaginatedResponse, MessageListItem, ReceiptStatus } from '@/types/api';

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

    const pages = [...prev.pages];
    const first = pages[0];
    const exists = first.data.some(
      (m) => m.id === message.id || (m.clientMessageId && m.clientMessageId === message.clientMessageId),
    );

    if (exists) {
      pages[0] = {
        ...first,
        data: first.data.map((m) => {
          const match =
            m.id === message.id ||
            (!!m.clientMessageId && m.clientMessageId === message.clientMessageId);
          return match ? { ...m, ...message } : m;
        }),
      };
      return { ...prev, pages };
    }

    pages[0] = {
      ...first,
      data: [message, ...first.data],
    };

    return { ...prev, pages };
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
}) {
  const { conversationId, messagesQueryKey } = params;
  const queryClient = useQueryClient();
  const { socket, isConnected } = useSocket();

  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    const onMessageNew = (payload: MessageNewPayload) => {
      const currentConversationId = conversationIdRef.current;
      if (!currentConversationId) return;
      if (payload.conversationId !== currentConversationId) return;

      upsertMessageToCache(queryClient, messagesQueryKey, payload.message);
    };

    const onMessagesSync = (payload: MessagesSyncPayload) => {
      const currentConversationId = conversationIdRef.current;
      if (!currentConversationId) return;

      for (const m of payload.messages) {
        if (m.conversationId !== currentConversationId) continue;
        upsertMessageToCache(queryClient, messagesQueryKey, m);
      }
    };

    const onSentAck = (payload: MessageSentAckPayload) => {
      applySentAckToCache(queryClient, messagesQueryKey, payload);
    };

    const onReceiptUpdate = (payload: ReceiptUpdatePayload) => {
      applyReceiptUpdateToCache(queryClient, messagesQueryKey, payload);
    };

    socket.on(SocketEvents.MESSAGE_NEW, onMessageNew);
    socket.on(SocketEvents.MESSAGES_SYNC, onMessagesSync);
    socket.on(SocketEvents.MESSAGE_SENT_ACK, onSentAck);
    socket.on(SocketEvents.MESSAGE_RECEIPT_UPDATE, onReceiptUpdate);

    return () => {
      socket.off(SocketEvents.MESSAGE_NEW, onMessageNew);
      socket.off(SocketEvents.MESSAGES_SYNC, onMessagesSync);
      socket.off(SocketEvents.MESSAGE_SENT_ACK, onSentAck);
      socket.off(SocketEvents.MESSAGE_RECEIPT_UPDATE, onReceiptUpdate);
    };
  }, [socket, isConnected, queryClient, messagesQueryKey]);

  return {
    isConnected,
    emitSendMessage: <T extends Record<string, unknown>>(
      dto: T,
      ack?: (response: SocketAck<{ messageId: string }>) => void,
    ) => {
      if (!socket) return;
      socket.emit(SocketEvents.MESSAGE_SEND, dto, ack);
    },
  };
}
