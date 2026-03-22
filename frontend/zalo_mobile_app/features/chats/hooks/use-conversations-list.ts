import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { Conversation, ConversationListResponse } from '@/types/conversation';
import { useSocket } from '@/providers/socket-provider';
import { SocketEvents } from '@/constants/socket-events';
import { Message } from '@/types/message';

export function useConversationsList(limit: number = 20) {
  const { accessToken, user } = useAuth();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const queryKey = ['conversations', accessToken];

  useEffect(() => {
    if (!socket || !accessToken) return;

    const handleListItemUpdated = (payload: any) => {
      queryClient.setQueryData(queryKey, (oldData: any) => {
        if (!oldData) return oldData;

        // 1. Find the conversation in existing pages
        let targetConversation: Conversation | null = null;
        let foundPageIdx = -1;
        
        for (let i = 0; i < oldData.pages.length; i++) {
          const itemIdx = oldData.pages[i].data.findIndex((c: Conversation) => c.id === payload.conversationId);
          if (itemIdx !== -1) {
            targetConversation = oldData.pages[i].data[itemIdx];
            foundPageIdx = i;
            break;
          }
        }

        // 2. Prepare the updated conversation
        if (!targetConversation) {
          // Nếu không tìm thấy, invalidate để fetch lại
          queryClient.invalidateQueries({ queryKey });
          return oldData;
        }

        const updatedConversation: Conversation = {
          ...targetConversation,
          lastMessage: payload.lastMessage,
          lastMessageAt: payload.lastMessageAt,
          updatedAt: payload.lastMessageAt,
          unreadCount: (targetConversation.unreadCount || 0) + (payload.unreadCountDelta || 0),
          isRecentlyUpdated: true, // Thêm flag highlight
        };

        // 3. Xây dựng lại pages: Xóa ở vị trí cũ, đẩy lên đầu page[0]
        const cleanedPages = oldData.pages.map((page: any, pIdx: number) => {
          if (pIdx === foundPageIdx) {
            return {
              ...page,
              data: page.data.filter((c: Conversation) => c.id !== payload.conversationId),
            };
          }
          return page;
        });

        // Đẩy hội thoại mới đã cập nhật lên đầu page 0
        const finalPages = cleanedPages.map((page: any, pIdx: number) => {
          if (pIdx === 0) {
            return {
              ...page,
              data: [updatedConversation, ...page.data],
            };
          }
          return page;
        });

        return { ...oldData, pages: finalPages };
      });

    };

    socket.on(SocketEvents.CONVERSATION_LIST_ITEM_UPDATED, handleListItemUpdated);

    return () => {
      socket.off(SocketEvents.CONVERSATION_LIST_ITEM_UPDATED, handleListItemUpdated);
    };
  }, [socket, accessToken, queryClient, queryKey, user?.id]);

  return useCursorPagination<Conversation>(
    queryKey,
    (cursor) => mobileApi.getConversations(accessToken!, { cursor, limit }),
    {
      enabled: !!accessToken,
    }
  );
}
