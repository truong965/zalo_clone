import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { Message } from '@/types/message';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useEffect } from 'react';
import { useSocket } from '@/providers/socket-provider';
import { socketManager } from '@/lib/socket';
import { SocketEvents } from '@/constants/socket-events';
import { useTranslationStore } from '@/hooks/use-translation-store';
import {
  applyConversationReadToCache,
  applyMessageDeletedForMeToCache,
  applyMessageRecalledToCache,
  applyReceiptUpdateToCache,
  applySendFailedToCache,
  applySentAckToCache,
  upsertMessageToCache,
  MessageDeletedForMePayload,
  MessageRecalledPayload,
  MessageSentAckPayload,
  ReceiptUpdatePayload,
  ConversationReadPayload,
  SocketErrorPayload,
} from '../utils/message-cache-helpers';
import { ReplyTarget } from '../stores/chat.store';
import { MobileAsset, useMobileMediaUpload } from './use-mobile-media-upload';
import Toast from 'react-native-toast-message';

function buildOptimisticParentMessage(target: ReplyTarget): any {
  return {
    id: target.messageId,
    content: target.content ?? null,
    senderId: null,
    type: target.type,
    deletedAt: null,
    sender: { id: '', displayName: target.senderName, avatarUrl: null },
    mediaAttachments: target.mediaAttachments?.map((a) => ({
      id: '',
      mediaType: a.mediaType,
      originalName: a.originalName,
      thumbnailUrl: null,
    })) ?? [],
  };
}

export const messagesQueryKey = (
  conversationId: string,
  direction: 'older' | 'newer' = 'older',
) => ['messages', conversationId, direction] as const;

// ─────────────────────────────────────────────────────────────
// useMessagesList
// ─────────────────────────────────────────────────────────────
export function useMessagesList(
  conversationId: string,
  direction: 'older' | 'newer' = 'older',
) {
  const { accessToken } = useAuth();

  return useCursorPagination<Message>(
    messagesQueryKey(conversationId, direction),
    (cursor) =>
      mobileApi.getMessages(conversationId, accessToken!, cursor, direction),
    { enabled: !!accessToken && !!conversationId },
  );
}

// ─────────────────────────────────────────────────────────────
// useSendMessage
// ─────────────────────────────────────────────────────────────
export function useSendMessage() {
  const { accessToken, user } = useAuth();
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();
  const { uploadAsset } = useMobileMediaUpload();

  return useMutation({
    onMutate: async (variables: {
      conversationId: string;
      content?: string;
      type: string;
      clientMessageId: string;
      mediaIds?: string[];
      localAssets?: MobileAsset[];
      replyTarget?: ReplyTarget;
    }) => {
      const queryKey = messagesQueryKey(variables.conversationId, 'older');
      await queryClient.cancelQueries({ queryKey });

      const previousMessages = queryClient.getQueryData(queryKey);

      const optimisticMessage = {
        id: `temp-${variables.clientMessageId}`,
        conversationId: variables.conversationId,
        content: variables.content,
        type: variables.type,
        clientMessageId: variables.clientMessageId,
        senderId: user?.id,
        createdAt: new Date().toISOString(),
        metadata: { sendStatus: 'SENDING' },
        parentMessage: variables.replyTarget ? buildOptimisticParentMessage(variables.replyTarget) : null,
        mediaAttachments: variables.localAssets?.map((asset, idx) => ({
          id: `temp-media-${idx}`,
          mediaType: asset.type.toUpperCase(),
          mimeType: asset.mimeType,
          originalName: asset.fileName,
          size: asset.fileSize,
          processingStatus: 'UPLOADING',
          _localUrl: asset.uri,
        })) ?? [],
      };

      queryClient.setQueryData(queryKey, (oldData: any) => {
        if (!oldData) return { pages: [{ data: [optimisticMessage], nextCursor: null }], pageParams: [] };
        return {
          ...oldData,
          pages: oldData.pages.map((page: any, index: number) =>
            index === 0
              ? { ...page, data: [optimisticMessage, ...page.data] }
              : page,
          ),
        };
      });

      return { previousMessages, queryKey };
    },
    mutationFn: async (data: {
      conversationId: string;
      content?: string;
      type: string;
      clientMessageId: string;
      mediaIds?: string[];
      localAssets?: MobileAsset[];
      replyToMessageId?: string;
      replyTarget?: ReplyTarget;
    }) => {
      let finalMediaIds = data.mediaIds || [];

      // If we have local assets, upload them first
      if (data.localAssets && data.localAssets.length > 0) {
        try {
          const uploadPromises = data.localAssets.map(asset => uploadAsset(asset));
          const uploadedIds = await Promise.all(uploadPromises);
          finalMediaIds = [...finalMediaIds, ...uploadedIds];
        } catch (error) {
          console.error('Failed to upload some assets:', error);
          throw new Error('Không thể tải lên tệp đính kèm. Vui lòng thử lại.');
        }
      }

      const payload = {
        conversationId: data.conversationId,
        content: data.content,
        type: data.type,
        clientMessageId: data.clientMessageId,
        mediaIds: finalMediaIds,
        ...(data.replyTarget ? { replyTo: { messageId: data.replyTarget.messageId } } :
          data.replyToMessageId ? { replyTo: { messageId: data.replyToMessageId } } : {}),
      };

      if (isConnected && socket) {
        return socketManager.emitWithAck<any>(SocketEvents.MESSAGE_SEND, payload).then((res) => {
          return {
            id: res.messageId || `temp-${data.clientMessageId}`,
            clientMessageId: data.clientMessageId,
            conversationId: data.conversationId,
            content: data.content,
            type: data.type,
            senderId: user?.id,
            createdAt: new Date().toISOString(),
          } as any;
        });
      }
      return mobileApi.sendMessage(payload as any, accessToken!);
    },
    onError: (err, variables, context: any) => {
      queryClient.setQueryData(context.queryKey, (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            data: page.data.map((m: any) =>
              m.clientMessageId === variables.clientMessageId
                ? { ...m, metadata: { ...m.metadata, sendStatus: 'FAILED' } }
                : m,
            ),
          })),
        };
      });

      Toast.show({
        type: 'error',
        text1: 'Lỗi gửi tin nhắn',
        text2: err instanceof Error ? err.message : 'Đã có lỗi xảy ra',
        position: 'top',
      });
    },
    onSuccess: (newMessage, variables) => {
      queryClient.setQueryData(
        messagesQueryKey(variables.conversationId, 'older'),
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              data: page.data.map((m: any) =>
                m.clientMessageId === variables.clientMessageId
                  ? {
                    ...m,
                    ...newMessage,
                    metadata: { ...m.metadata, ...newMessage.metadata, sendStatus: 'SENT' }
                  }
                  : m,
              ),
            })),
          };
        },
      );
      // Socket ack may not include full mediaAttachments (e.g. VOICE),
      // so refetch once to hydrate the real message payload.
      queryClient.invalidateQueries({
        queryKey: messagesQueryKey(variables.conversationId, 'older'),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────
// useRecallMessage
// ─────────────────────────────────────────────────────────────
export function useRecallMessage() {
  const { accessToken, user } = useAuth();
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: { conversationId: string; messageId: string }) => {
      if (isConnected && socket) {
        return socketManager.emitWithAck<MessageRecalledPayload>(
          SocketEvents.MESSAGE_RECALL,
          {
            conversationId: variables.conversationId,
            messageId: variables.messageId,
          },
        );
      }

      if (!accessToken) {
        throw new Error('Bạn cần đăng nhập lại để thu hồi tin nhắn');
      }

      await mobileApi.recallMessage(variables.messageId, accessToken);
      return {
        messageId: variables.messageId,
        conversationId: variables.conversationId,
        recalledBy: user?.id ?? '',
        recalledAt: new Date().toISOString(),
      } satisfies MessageRecalledPayload;
    },
    onSuccess: (payload, variables) => {
      const normalizedPayload: MessageRecalledPayload = {
        messageId: payload.messageId ?? variables.messageId,
        conversationId: payload.conversationId ?? variables.conversationId,
        recalledBy: payload.recalledBy ?? (user?.id ?? ''),
        recalledAt: payload.recalledAt ?? new Date().toISOString(),
      };

      applyMessageRecalledToCache(
        queryClient,
        messagesQueryKey(variables.conversationId, 'older'),
        normalizedPayload,
      );

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error) => {
      Toast.show({
        type: 'error',
        text1: 'Thu hồi thất bại',
        text2: error instanceof Error ? error.message : 'Đã có lỗi xảy ra',
        position: 'top',
      });
    },
  });
}

// ─────────────────────────────────────────────────────────────
// useForwardMessage
// ─────────────────────────────────────────────────────────────
export function useForwardMessage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: {
      sourceMessageId: string;
      targetConversationIds: string[];
      clientRequestId: string;
      includeCaption?: boolean;
    }) => {
      if (!accessToken) {
        throw new Error('Bạn cần đăng nhập lại để chuyển tiếp tin nhắn');
      }

      return mobileApi.forwardMessage(variables, accessToken);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });

      // Invalidate message caches for each target conversation
      for (const targetId of variables.targetConversationIds) {
        queryClient.invalidateQueries({ queryKey: messagesQueryKey(targetId, 'older') });
      }

      Toast.show({
        type: 'success',
        text1: 'Đã chuyển tiếp tin nhắn',
        position: 'top',
      });
    },
    onError: (error) => {
      Toast.show({
        type: 'error',
        text1: 'Chuyển tiếp thất bại',
        text2: error instanceof Error ? error.message : 'Đã có lỗi xảy ra',
        position: 'top',
      });
    },
  });
}

// ─────────────────────────────────────────────────────────────
// useDeleteMessageForMe
// ─────────────────────────────────────────────────────────────
export function useDeleteMessageForMe() {
  const { accessToken, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: async (variables: { conversationId: string; messageId: string }) => {
      const queryKey = messagesQueryKey(variables.conversationId, 'older');
      await queryClient.cancelQueries({ queryKey });

      const previousMessages = queryClient.getQueryData(queryKey);

      const optimisticPayload: MessageDeletedForMePayload = {
        conversationId: variables.conversationId,
        messageId: variables.messageId,
        userId: user?.id ?? '',
        deletedAt: new Date().toISOString(),
      };

      applyMessageDeletedForMeToCache(queryClient, queryKey, optimisticPayload);

      return { previousMessages, queryKey };
    },
    mutationFn: async (variables: { conversationId: string; messageId: string }) => {
      if (!accessToken) {
        throw new Error('Bạn cần đăng nhập lại để xóa tin nhắn');
      }

      await mobileApi.deleteMessageForMe(variables.messageId, accessToken);
      return {
        conversationId: variables.conversationId,
        messageId: variables.messageId,
        userId: user?.id ?? '',
        deletedAt: new Date().toISOString(),
      } satisfies MessageDeletedForMePayload;
    },
    onError: (error, _variables, context: any) => {
      if (context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousMessages);
      }

      Toast.show({
        type: 'error',
        text1: 'Xóa tin nhắn thất bại',
        text2: error instanceof Error ? error.message : 'Đã có lỗi xảy ra',
        position: 'top',
      });
    },
    onSuccess: (payload, variables) => {
      applyMessageDeletedForMeToCache(
        queryClient,
        messagesQueryKey(variables.conversationId, 'older'),
        payload,
      );
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────
// useChatRealtime
// ─────────────────────────────────────────────────────────────
export function useChatRealtime(
  conversationId: string,
  // FIX Bug 2: Nhận jump guard refs từ _id_.tsx.
  // Khi isJumpingRef.current = true (đang fetch context):
  //   - Không upsert message vào cache ngay (sẽ bị setQueryData của jump overwrite)
  //   - Buffer vào jumpBufferRef để flush sau khi jump xong
  //
  // Tại sao optional? Để backward compatible nếu useChatRealtime được dùng ở
  // màn hình khác không có jump feature.
  jumpRefs?: {
    isJumpingRef: React.MutableRefObject<boolean>;
    jumpBufferRef: React.MutableRefObject<Message[]>;
  },
) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const setTranslation = useTranslationStore((state) => state.setTranslation);
  const finishTranslation = useTranslationStore((state) => state.finishTranslation);

  useEffect(() => {
    if (!socket || !conversationId) return;

    const handleNewMessage = (payload: {
      message: Message;
      conversationId: string;
    }) => {
      if (payload.conversationId !== conversationId) return;

      const senderId = payload.message.senderId ?? null;
      const myId = user?.id;

      if (socket && senderId && myId && senderId !== myId) {
        socket.emit(SocketEvents.MESSAGE_DELIVERED_CLIENT_ACK, {
          messageId: payload.message.id,
        });
      }

      // FIX Bug 2: Socket guard — mirror pattern của web.
      //
      // Scenario xảy ra nếu không có guard:
      //   t=0ms  : user tap reply quote → jumpToMessage() bắt đầu
      //   t=0ms  : isJumpingRef = true, await getMessageContext()
      //   t=150ms: socket nhận MESSAGE_NEW → upsertMessageToCache() → cache có message mới
      //   t=300ms: getMessageContext() resolve → setQueryData(contextPage) → OVERWRITE cache
      //   t=300ms: message mới ở t=150ms bị mất hoàn toàn
      //
      // Với guard:
      //   t=150ms: isJumpingRef.current = true → push vào jumpBufferRef thay vì upsert
      //   t=300ms: setQueryData(contextPage)
      //   t=300ms: finally block → flush jumpBufferRef → upsert message mới vào contextPage
      //   → Không mất message
      if (jumpRefs?.isJumpingRef.current) {
        jumpRefs.jumpBufferRef.current.push(payload.message);
        return;
      }

      upsertMessageToCache(
        queryClient,
        messagesQueryKey(conversationId, 'older'),
        payload.message,
      );

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    const handleSentAck = (payload: MessageSentAckPayload) => {
      applySentAckToCache(
        queryClient,
        messagesQueryKey(conversationId, 'older'),
        payload,
      );
    };

    const handleReceiptUpdate = (payload: ReceiptUpdatePayload) => {
      if (payload.conversationId !== conversationId) return;
      applyReceiptUpdateToCache(
        queryClient,
        messagesQueryKey(conversationId, 'older'),
        payload,
      );
    };

    const handleConversationRead = (payload: ConversationReadPayload) => {
      if (payload.conversationId !== conversationId) return;
      applyConversationReadToCache(
        queryClient,
        messagesQueryKey(conversationId, 'older'),
        payload,
      );
    };

    const handleMessageRecalled = (payload: MessageRecalledPayload) => {
      if (payload.conversationId !== conversationId) return;
      applyMessageRecalledToCache(
        queryClient,
        messagesQueryKey(conversationId, 'older'),
        payload,
      );
    };

    const handleError = (payload: SocketErrorPayload) => {
      applySendFailedToCache(
        queryClient,
        messagesQueryKey(conversationId, 'older'),
        payload,
      );
    };

    const handleConversationUpdated = (payload: { conversationId: string }) => {
      if (payload.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    };

    const handleGroupUpdated = (payload: { conversationId: string }) => {
      if (payload.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    };

    const handleAiTranslate = (payload: any) => {
      console.log('[Socket] AI_TRANSLATE received:', payload);
      const msgId = payload?.messageId;
      const targetLang = payload?.targetLang;
      const translatedText = payload?.translatedText || payload?.data?.translatedText;

      if (!msgId || !targetLang || !translatedText) {
        console.warn('[Socket] AI_TRANSLATE missing fields', payload);
        return;
      }
      if (payload.conversationId && String(payload.conversationId) !== String(conversationId)) return;

      setTranslation(String(msgId), targetLang, translatedText);
      finishTranslation(String(msgId), targetLang);
    };

    const handleAiTranslateError = (payload: any) => {
      console.log('[Socket] AI_TRANSLATE_ERROR received:', payload);
      const msgId = payload?.messageId;
      const targetLang = payload?.targetLang;
      const message = payload?.message || payload?.error || 'Đã có lỗi xảy ra khi dịch';

      if (!msgId || !targetLang) return;
      if (payload.conversationId && String(payload.conversationId) !== String(conversationId)) return;

      finishTranslation(String(msgId), targetLang);
      Toast.show({
        type: 'error',
        text1: 'Dịch thất bại',
        text2: message,
        position: 'top',
      });
    };

    const handleFriendOnline = (payload: { userId: string; timestamp: string }) => {
      queryClient.setQueryData(['conversation', conversationId], (old: any) => {
        if (!old || old.otherUserId !== payload.userId) return old;
        return { ...old, isOnline: true, lastSeenAt: null };
      });
    };

    const handleFriendOffline = (payload: { userId: string; timestamp: string }) => {
      queryClient.setQueryData(['conversation', conversationId], (old: any) => {
        if (!old || old.otherUserId !== payload.userId) return old;
        return { ...old, isOnline: false, lastSeenAt: payload.timestamp };
      });
    };

    socket.on(SocketEvents.MESSAGE_NEW, handleNewMessage);
    socket.on(SocketEvents.MESSAGE_SENT_ACK, handleSentAck);
    socket.on(SocketEvents.MESSAGE_RECEIPT_UPDATE, handleReceiptUpdate);
    socket.on(SocketEvents.CONVERSATION_READ, handleConversationRead);
    socket.on(SocketEvents.MESSAGE_RECALLED, handleMessageRecalled);
    socket.on(SocketEvents.FRIEND_ONLINE, handleFriendOnline);
    socket.on(SocketEvents.FRIEND_OFFLINE, handleFriendOffline);
    socket.on(SocketEvents.CONVERSATION_UPDATED, handleConversationUpdated);
    socket.on(SocketEvents.GROUP_UPDATED, handleGroupUpdated);
    socket.on(SocketEvents.AI_TRANSLATE, handleAiTranslate);
    socket.on(SocketEvents.AI_STREAM_ERROR, handleAiTranslateError);
    socket.on(SocketEvents.AI_RESPONSE_ERROR, handleAiTranslateError);
    socket.on(SocketEvents.ERROR, handleError);

    return () => {
      socket.off(SocketEvents.MESSAGE_NEW, handleNewMessage);
      socket.off(SocketEvents.MESSAGE_SENT_ACK, handleSentAck);
      socket.off(SocketEvents.MESSAGE_RECEIPT_UPDATE, handleReceiptUpdate);
      socket.off(SocketEvents.CONVERSATION_READ, handleConversationRead);
      socket.off(SocketEvents.MESSAGE_RECALLED, handleMessageRecalled);
      socket.off(SocketEvents.FRIEND_ONLINE, handleFriendOnline);
      socket.off(SocketEvents.FRIEND_OFFLINE, handleFriendOffline);
      socket.off(SocketEvents.CONVERSATION_UPDATED, handleConversationUpdated);
      socket.off(SocketEvents.GROUP_UPDATED, handleGroupUpdated);
      socket.off(SocketEvents.AI_TRANSLATE, handleAiTranslate);
      socket.off(SocketEvents.AI_STREAM_ERROR, handleAiTranslateError);
      socket.off(SocketEvents.AI_RESPONSE_ERROR, handleAiTranslateError);
      socket.off(SocketEvents.ERROR, handleError);
    };
    // jumpRefs là object ref — stable reference, không cần trong deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversationId, queryClient, user?.id, setTranslation, finishTranslation]);
}
