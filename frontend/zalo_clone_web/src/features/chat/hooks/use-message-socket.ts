import { useEffect, useRef } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/hooks/use-socket';
import { SocketEvents } from '@/constants/socket-events';
import type { MessageListItem } from '@/types/api';
import { useAuthStore } from '@/features/auth';
import {
      applySendFailedToCache,
      upsertMessageToCache,
      applySentAckToCache,
      applyReceiptUpdateToCache,
      applyConversationReadToCache,
} from '../utils/message-cache-helpers';
import type {
      MessageSentAckPayload,
      ReceiptUpdatePayload,
      ConversationReadPayload,
      SocketErrorPayload,
} from '../utils/message-cache-helpers';

// Re-export shared types so existing consumers keep working
export type { MessagesPage, MessagesInfiniteData } from '../utils/message-cache-helpers';

type SocketAck<T> = ({ error?: undefined } & T) | { error: string };

type MessageNewPayload = { message: MessageListItem; conversationId: string };

type MessagesSyncPayload = { messages: MessageListItem[]; count: number };

type TypingStatusPayload = {
      conversationId: string;
      userId: string;
      isTyping: boolean;
};

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
