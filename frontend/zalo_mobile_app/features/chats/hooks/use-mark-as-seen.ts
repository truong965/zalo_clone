import { useCallback } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useSocket } from '@/providers/socket-provider';
import { SocketEvents } from '@/constants/socket-events';
import { useAuth } from '@/providers/auth-provider';
import { Conversation, ConversationListResponse } from '@/types/conversation';

export function useMarkAsSeen() {
  const { socket } = useSocket();
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const markAsSeen = useCallback(
    async (conversationId: string, lastMessageId?: string) => {
      if (!socket || !accessToken || !conversationId) return;

      // 1. Emit socket event
      socket.emit(SocketEvents.MESSAGE_SEEN, {
        conversationId,
        messageIds: lastMessageId ? [lastMessageId] : [],
      });

      // 2. Optimistically update the conversation list cache
      const queryKey = ['conversations', accessToken];
      queryClient.setQueryData<InfiniteData<ConversationListResponse, string | undefined>>(
        queryKey,
        (oldData) => {
          if (!oldData) return oldData;

          const pages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.map((conv) => {
              if (conv.id !== conversationId) return conv;
              return {
                ...conv,
                unreadCount: 0,
              };
            }),
          }));

          return { ...oldData, pages };
        }
      );
    },
    [socket, accessToken, queryClient]
  );

  return { markAsSeen };
}
