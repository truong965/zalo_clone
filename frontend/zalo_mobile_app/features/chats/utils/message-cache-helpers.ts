/**
 * message-cache-helpers.ts
 *
 * Cache-update helpers for the mobile messages infinite query.
 */

import { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import { Message } from '@/types/message';

// ============================================================================
// SHARED TYPE ALIASES
// ============================================================================

export type MessagesPage = { data: Message[]; nextCursor: string | null };
export type MessagesInfiniteData = InfiniteData<MessagesPage, string | undefined>;

// ============================================================================
// INTERNAL PAYLOAD TYPES
// ============================================================================

export type MessageSentAckPayload = {
  clientMessageId: string;
  serverMessageId: string;
  timestamp: string;
};

export type ReceiptUpdatePayload = {
  messageId: string;
  conversationId: string;
  userId: string;
  type: 'delivered' | 'seen';
  timestamp: string;
};

export type ConversationReadPayload = {
  conversationId: string;
  userId: string;
  messageId: string | null;
  timestamp: string;
};

export type SocketErrorPayload = {
  event?: string;
  clientMessageId?: string;
  error?: string;
  message?: string | object;
  code?: string;
};

// ============================================================================
// CACHE HELPERS
// ============================================================================

/**
 * Mark a pending message as FAILED in the cache.
 */
export function applySendFailedToCache(
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

/**
 * Insert or deduplicate a message in the cache.
 */
export function upsertMessageToCache(
  queryClient: QueryClient,
  queryKey: QueryKey,
  message: Message,
) {
  queryClient.setQueryData<MessagesInfiniteData>(queryKey, (prev) => {
    if (!prev) {
      return {
        pages: [{ data: [message], nextCursor: null }],
        pageParams: [undefined],
      };
    }

    const isMatch = (m: Message) => {
      if (m.id === message.id) return true;
      if (!m.clientMessageId || !message.clientMessageId) return false;
      return m.clientMessageId === message.clientMessageId;
    };

    const foundExisting = prev.pages
      .flatMap((p) => p.data)
      .find((m) => isMatch(m));

    const merged: Message = foundExisting
      ? {
          ...foundExisting,
          ...message,
          // Ưu tiên replyTo/parentMessage từ message mới (server), nếu không có thì giữ lại từ foundExisting (optimistic)
          parentMessage: message.parentMessage || foundExisting.parentMessage,
          replyTo: message.replyTo || foundExisting.replyTo,
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

/**
 * Replace `clientMessageId` with `serverMessageId`
 */
export function applySentAckToCache(
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
 * Update `directReceipts` for DIRECT message.
 */
export function applyReceiptUpdateToCache(
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

        const current = (m.directReceipts as Record<string, any>) ?? {};
        const entry = current[payload.userId] ?? { delivered: null, seen: null };

        const hadNoDelivered = entry.delivered === null;
        const hadNoSeen = entry.seen === null;

        const isNewDelivered = payload.type === 'delivered' && hadNoDelivered;
        const isNewSeen = payload.type === 'seen' && hadNoSeen;
        const shouldBackfillDelivered = payload.type === 'seen' && hadNoDelivered;

        if (!isNewDelivered && !isNewSeen && !shouldBackfillDelivered) {
          return m;
        }

        pageChanged = true;

        const updated = {
          ...current,
          [payload.userId]: {
            delivered: shouldBackfillDelivered
              ? payload.timestamp
              : entry.delivered ?? (payload.type === 'delivered' ? payload.timestamp : null),
            seen: payload.type === 'seen' ? payload.timestamp : entry.seen,
          },
        };

        return {
          ...m,
          directReceipts: updated,
          deliveredCount:
            isNewDelivered || shouldBackfillDelivered
              ? (m.deliveredCount ?? 0) + 1
              : m.deliveredCount ?? 0,
          seenCount: isNewSeen ? (m.seenCount ?? 0) + 1 : m.seenCount ?? 0,
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

/**
 * Apply a group `conversation:read` event
 */
export function applyConversationReadToCache(
  queryClient: QueryClient,
  queryKey: QueryKey,
  payload: ConversationReadPayload,
) {
  if (!payload.messageId) return;

  queryClient.setQueryData<MessagesInfiniteData>(queryKey, (prev) => {
    if (!prev) return prev;

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
        // Only update messages older than or equal to target message
        if (new Date(m.createdAt).getTime() > new Date(targetCreatedAt).getTime()) return m;

        const total = m.totalRecipients ?? 1;
        const currentSeen = m.seenCount ?? 0;
        const nextSeen = Math.min(currentSeen + 1, total);

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
