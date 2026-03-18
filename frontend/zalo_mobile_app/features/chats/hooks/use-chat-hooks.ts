import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { Message, MessageListResponse } from '@/types/message';
import { useCursorPagination } from '@/hooks/use-cursor-pagination';
import { useEffect } from 'react';
import { useSocket } from '@/providers/socket-provider';
import { SocketEvents } from '@/constants/socket-events';

export function useMessagesList(conversationId: string) {
  const { accessToken } = useAuth();
  
  return useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: ({ pageParam }) => 
      mobileApi.getMessages(conversationId, accessToken!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: MessageListResponse) => lastPage.nextCursor,
    enabled: !!accessToken && !!conversationId,
    // Invert the list for chat, so we fetch "older" messages as we scroll up
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      // We don't need to reverse here if we use inverted FlashList, 
      // but we need a flattened list of all messages across pages
      allMessages: data.pages.flatMap(page => page.data).sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    }),
  });
}

export function useSendMessage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { conversationId: string; content?: string; type: string; clientMessageId: string; mediaIds?: string[] }) =>
      mobileApi.sendMessage(data, accessToken!),
    onSuccess: (newMessage, variables) => {
      // Optimistically update the message list or just invalidate
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useChatRealtime(conversationId: string) {
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !conversationId) return;

    const handleNewMessage = (payload: { message: Message; conversationId: string }) => {
      if (payload.conversationId === conversationId) {
        // Option 1: Invalidate to re-fetch (simple)
        // Option 2: Manually update the infinite query cache (better performance)
        queryClient.setQueryData(['messages', conversationId], (oldData: any) => {
          if (!oldData) return oldData;
          
          return {
            ...oldData,
            pages: oldData.pages.map((page: any, index: number) => {
              if (index === 0) {
                return {
                  ...page,
                  data: [payload.message, ...page.data],
                };
              }
              return page;
            }),
          };
        });
      }
    };

    socket.on(SocketEvents.MESSAGE_NEW, handleNewMessage);

    return () => {
      socket.off(SocketEvents.MESSAGE_NEW, handleNewMessage);
    };
  }, [socket, conversationId, queryClient]);
}
