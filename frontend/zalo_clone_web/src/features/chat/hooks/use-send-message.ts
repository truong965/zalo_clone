/**
 * useSendMessage — Optimistic send + retry logic for chat messages.
 *
 * Extracted from ChatFeature. All logic preserved exactly as-is.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { notification } from 'antd';
import type { SendPayload } from '../components/chat-input';
import { messageService } from '../api/message.api';
import type { MessageListItem, MessageType, MediaProcessingStatus } from '@/types/api';
import type { MessagesInfiniteData, MessagesPage } from '../utils/message-cache-helpers';

interface UseSendMessageParams {
      selectedId: string | null;
      currentUserId: string | null;
      messagesQueryKey: QueryKey;
      isMsgSocketConnected: boolean;
      emitSendMessage: <T extends Record<string, unknown>>(
            dto: T,
            ack?: (response: ({ error?: undefined } & { messageId: string }) | { error: string }) => void,
      ) => void;
}

export function useSendMessage(params: UseSendMessageParams) {
      const { selectedId, currentUserId, messagesQueryKey, isMsgSocketConnected, emitSendMessage } = params;
      const queryClient = useQueryClient();
      const [api] = notification.useNotification();

      const handleSendMessage = useCallback(async (payload: SendPayload) => {
            if (!selectedId) return;

            const { type, content, mediaIds, _localFiles } = payload;
            const trimmed = content?.trim();

            // Text-only: must have content
            if (type === 'TEXT' && !trimmed) return;

            const clientMessageId = crypto.randomUUID();
            const nowIso = new Date().toISOString();

            // Build optimistic mediaAttachments from _localFiles
            const optimisticAttachments = _localFiles?.map((lf) => ({
                  id: lf.mediaId,
                  mediaType: lf.mediaType,
                  mimeType: lf.mimeType,
                  // Use the cdnUrl already available for inline-processed media (AUDIO/DOCUMENT).
                  cdnUrl: lf.cdnUrl ?? null,
                  thumbnailUrl: null,
                  optimizedUrl: null,
                  originalName: lf.originalName,
                  size: lf.size,
                  width: null,
                  height: null,
                  duration: null,
                  // Use the real status from confirmUpload — READY for inline media, CONFIRMED for queue-processed.
                  processingStatus: (lf.processingStatus ?? 'CONFIRMED') as MediaProcessingStatus,
                  _localUrl: lf.localUrl,
            })) ?? [];

            const optimistic: MessageListItem = {
                  id: clientMessageId,
                  conversationId: selectedId,
                  senderId: currentUserId ?? undefined,
                  type: type as MessageType,
                  content: trimmed ?? undefined,
                  metadata: { sendStatus: 'SENDING' },
                  clientMessageId,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                  sender: currentUserId
                        ? { id: currentUserId, displayName: 'Bạn', avatarUrl: null }
                        : null,
                  parentMessage: null,
                  deliveredCount: 0,
                  seenCount: 0,
                  totalRecipients: 0,
                  directReceipts: null,
                  mediaAttachments: optimisticAttachments,
            };

            queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey, (prev) => {
                  if (!prev) {
                        return {
                              pages: [{ data: [optimistic], meta: { limit: 50, hasNextPage: false } } as MessagesPage],
                              pageParams: [undefined],
                        };
                  }
                  const pages = [...prev.pages];
                  const first = pages[0];
                  pages[0] = { ...first, data: [optimistic, ...first.data] };
                  return { ...prev, pages };
            });

            const sendDto = {
                  conversationId: selectedId,
                  clientMessageId,
                  type: type as MessageType,
                  ...(trimmed ? { content: trimmed } : {}),
                  ...(mediaIds?.length ? { mediaIds } : {}),
            };

            if (isMsgSocketConnected) {
                  emitSendMessage(sendDto, (ack) => {
                        if (!ack || !('error' in ack) || !ack.error) return;
                        queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey, (prev) => {
                              if (!prev) return prev;
                              const pages = prev.pages.map((p) => ({
                                    ...p,
                                    data: p.data.map((m) => {
                                          if (m.clientMessageId !== clientMessageId) return m;
                                          return {
                                                ...m,
                                                metadata: { ...(m.metadata ?? {}), sendStatus: 'FAILED', sendError: ack.error },
                                          };
                                    }),
                              }));
                              return { ...prev, pages };
                        });
                  });
                  return;
            }

            try {
                  await messageService.sendMessage(sendDto);
            } catch {
                  queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey, (prev) => {
                        if (!prev) return prev;
                        const pages = prev.pages.map((p) => ({
                              ...p,
                              data: p.data.map((m) => {
                                    if (m.clientMessageId !== clientMessageId) return m;
                                    return {
                                          ...m,
                                          metadata: { ...(m.metadata ?? {}), sendStatus: 'FAILED', sendError: 'Send failed' },
                                    };
                              }),
                        }));
                        return { ...prev, pages };
                  });
                  api.error({ message: 'Gửi tin nhắn thất bại', placement: 'topRight' });
            }
      }, [selectedId, currentUserId, queryClient, messagesQueryKey, isMsgSocketConnected, emitSendMessage, api]);

      const handleRetryMessage = useCallback((msg: MessageListItem) => {
            if (!selectedId) return;
            if (!isMsgSocketConnected) return;
            if (!msg.clientMessageId) return;

            queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey, (prev) => {
                  if (!prev) return prev;
                  const pages = prev.pages.map((p) => ({
                        ...p,
                        data: p.data.map((m) => {
                              if (m.clientMessageId !== msg.clientMessageId) return m;
                              return {
                                    ...m,
                                    metadata: { ...(m.metadata ?? {}), sendStatus: 'SENDING' },
                              };
                        }),
                  }));
                  return { ...prev, pages };
            });

            emitSendMessage({
                  conversationId: selectedId,
                  clientMessageId: msg.clientMessageId,
                  type: msg.type,
                  content: msg.content,
            }, (ack) => {
                  if (!ack || !('error' in ack) || !ack.error) return;
                  queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey, (prev) => {
                        if (!prev) return prev;
                        const pages = prev.pages.map((p) => ({
                              ...p,
                              data: p.data.map((m) => {
                                    if (m.clientMessageId !== msg.clientMessageId) return m;
                                    return {
                                          ...m,
                                          metadata: { ...(m.metadata ?? {}), sendStatus: 'FAILED', sendError: ack.error },
                                    };
                              }),
                        }));
                        return { ...prev, pages };
                  });
            });
      }, [selectedId, isMsgSocketConnected, queryClient, messagesQueryKey, emitSendMessage]);

      return { handleSendMessage, handleRetryMessage };
}
