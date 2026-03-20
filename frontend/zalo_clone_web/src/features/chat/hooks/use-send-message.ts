/**
 * useSendMessage — Optimistic send + retry logic for chat messages.
 *
 * Extracted from ChatFeature. All logic preserved exactly as-is.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import type { SendPayload } from '../components/chat-input';
import { messageService } from '../api/message.api';
import type { MessageListItem, MessageType, MediaProcessingStatus } from '@/types/api';
import type { MessagesInfiniteData, MessagesPage } from '../utils/message-cache-helpers';
import { useChatStore, type ReplyTarget } from '../stores/chat.store';

/**
 * Build a parentMessage preview shape from the ReplyTarget snapshot
 * so the optimistic message renders the reply quote immediately.
 */
function buildOptimisticParentMessage(target: ReplyTarget) {
      return {
            id: target.messageId,
            content: target.content ?? null,
            senderId: null,
            type: target.type as MessageType,
            deletedAt: null,
            sender: { id: '', displayName: target.senderName, avatarUrl: null },
            mediaAttachments: target.mediaAttachments?.map((a) => ({
                  id: '',
                  mediaType: a.mediaType as import('@/types/api').MediaType,
                  originalName: a.originalName,
                  thumbnailUrl: null,
            })) ?? [],
      };
}

import { handleInteractionError } from '@/utils/interaction-error';

interface UseSendMessageParams {
      selectedId: string | null;
      currentUserId: string | null;
      messagesQueryKey: QueryKey;
      isMsgSocketConnected: boolean;
      emitSendMessage: <T extends Record<string, unknown>>(dto: T) => Promise<{ messageId: string }>;
}

export function useSendMessage(params: UseSendMessageParams) {
      const { selectedId, currentUserId, messagesQueryKey, isMsgSocketConnected, emitSendMessage } = params;
      const queryClient = useQueryClient();

      const handleSendMessage = useCallback(async (payload: SendPayload) => {
            if (!selectedId) return;

            const { type, content, mediaIds, _localFiles } = payload;
            const trimmed = content?.trim();

            // Text-only: must have content
            if (type === 'TEXT' && !trimmed) return;

            // Snapshot reply target and clear it immediately (optimistic UX)
            const replyTarget = useChatStore.getState().replyTarget;
            useChatStore.getState().setReplyTarget(null);

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
                  replyToId: replyTarget?.messageId ?? undefined,
                  parentMessage: replyTarget
                        ? buildOptimisticParentMessage(replyTarget)
                        : null,
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
                  ...(replyTarget ? { replyTo: { messageId: replyTarget.messageId } } : {}),
            };

            if (isMsgSocketConnected) {
                  try {
                        await emitSendMessage(sendDto);
                  } catch (error: any) {
                        queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey, (prev) => {
                              if (!prev) return prev;
                              const pages = prev.pages.map((p) => ({
                                    ...p,
                                    data: p.data.map((m) => {
                                          if (m.clientMessageId !== clientMessageId) return m;
                                          return {
                                                ...m,
                                                metadata: {
                                                      ...(m.metadata ?? {}),
                                                      sendStatus: 'FAILED',
                                                      sendError: error.message || 'Gửi thất bại',
                                                },
                                          };
                                    }),
                              }));
                              return { ...prev, pages };
                        });
                  }
                  return;
            }

            try {
                  await messageService.sendMessage(sendDto);
            } catch (error: any) {
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
                  handleInteractionError(error);
            }
      }, [selectedId, currentUserId, queryClient, messagesQueryKey, isMsgSocketConnected, emitSendMessage]);

      const handleRetryMessage = useCallback(async (msg: MessageListItem) => {
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

            try {
                  await emitSendMessage({
                        conversationId: selectedId,
                        clientMessageId: msg.clientMessageId,
                        type: msg.type,
                        content: msg.content,
                  });
            } catch (error: any) {
                  queryClient.setQueryData<MessagesInfiniteData>(messagesQueryKey, (prev) => {
                        if (!prev) return prev;
                        const pages = prev.pages.map((p) => ({
                              ...p,
                              data: p.data.map((m) => {
                                    if (m.clientMessageId !== msg.clientMessageId) return m;
                                    return {
                                          ...m,
                                          metadata: {
                                                ...(m.metadata ?? {}),
                                                sendStatus: 'FAILED',
                                                sendError: error.message || 'Gửi thất bại',
                                          },
                                    };
                              }),
                        }));
                        return { ...prev, pages };
                  });
            }
      }, [selectedId, isMsgSocketConnected, queryClient, messagesQueryKey, emitSendMessage]);

      return { handleSendMessage, handleRetryMessage };
}
