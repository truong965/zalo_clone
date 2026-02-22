/**
 * message-cache-helpers.ts
 *
 * Pure TanStack Query cache-update helpers for the messages infinite query.
 * Extracted from use-message-socket so they can be unit-tested independently
 * and reused by other hooks (e.g. useMediaProgress, useChatMessages).
 */

import type { InfiniteData, QueryKey, QueryClient } from '@tanstack/react-query';
import type { CursorPaginatedResponse, MessageListItem, DirectReceipts } from '@/types/api';

// ============================================================================
// SHARED TYPE ALIASES
// ============================================================================

export type MessagesPage = CursorPaginatedResponse<MessageListItem>;
export type MessagesInfiniteData = InfiniteData<MessagesPage, string | undefined>;

// ============================================================================
// INTERNAL PAYLOAD TYPES (used across helpers)
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
 * Merges metadata when a matching record already exists.
 */
export function upsertMessageToCache(
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

/**
 * Replace `clientMessageId` with the server-assigned `serverMessageId`
 * once the backend acknowledges a sent message.
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
 * Update `directReceipts` JSONB for a DIRECT message receipt event.
 * Returns the SAME reference if nothing actually changed (prevents re-renders).
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

                        const current: DirectReceipts = (m.directReceipts as DirectReceipts) ?? {};
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

            if (!anyChange) return prev;
            return { ...prev, pages };
      });
}

/**
 * Apply a group `conversation:read` event — increment `seenCount` for all
 * messages up to (and including) the read `messageId`.
 * Returns the SAME reference if nothing changed.
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
                        if (m.createdAt > targetCreatedAt) return m;

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
