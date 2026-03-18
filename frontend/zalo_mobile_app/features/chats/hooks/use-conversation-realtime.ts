import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/providers/socket-provider';
import { SocketEvents } from '@/constants/socket-events';

export function useConversationRealtime() {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !isConnected) return;

    const invalidateConversations = () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    socket.on(SocketEvents.MESSAGE_NEW, invalidateConversations);
    socket.on(SocketEvents.CONVERSATION_UPDATED, invalidateConversations);
    socket.on(SocketEvents.CONVERSATION_PINNED, invalidateConversations);
    socket.on(SocketEvents.CONVERSATION_UNPINNED, invalidateConversations);
    socket.on(SocketEvents.CONVERSATION_MUTED, invalidateConversations);
    socket.on(SocketEvents.CONVERSATION_LIST_ITEM_UPDATED, invalidateConversations);

    return () => {
      socket.off(SocketEvents.MESSAGE_NEW, invalidateConversations);
      socket.off(SocketEvents.CONVERSATION_UPDATED, invalidateConversations);
      socket.off(SocketEvents.CONVERSATION_PINNED, invalidateConversations);
      socket.off(SocketEvents.CONVERSATION_UNPINNED, invalidateConversations);
      socket.off(SocketEvents.CONVERSATION_MUTED, invalidateConversations);
      socket.off(SocketEvents.CONVERSATION_LIST_ITEM_UPDATED, invalidateConversations);
    };
  }, [socket, isConnected, queryClient]);
}
