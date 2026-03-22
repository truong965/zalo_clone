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

    socket.on(SocketEvents.CONVERSATION_UPDATED, invalidateConversations);
    socket.on(SocketEvents.CONVERSATION_PINNED, invalidateConversations);
    socket.on(SocketEvents.CONVERSATION_UNPINNED, invalidateConversations);
    socket.on(SocketEvents.CONVERSATION_MUTED, invalidateConversations);

    return () => {
      socket.off(SocketEvents.CONVERSATION_UPDATED, invalidateConversations);
      socket.off(SocketEvents.CONVERSATION_PINNED, invalidateConversations);
      socket.off(SocketEvents.CONVERSATION_UNPINNED, invalidateConversations);
      socket.off(SocketEvents.CONVERSATION_MUTED, invalidateConversations);
    };
  }, [socket, isConnected, queryClient]);
}
