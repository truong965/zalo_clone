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
    socket.on(SocketEvents.GROUP_DISSOLVED, invalidateConversations);
    socket.on(SocketEvents.GROUP_MEMBER_REMOVED, invalidateConversations);
    socket.on(SocketEvents.GROUP_MEMBER_LEFT, invalidateConversations);
    socket.on(SocketEvents.GROUP_YOU_WERE_REMOVED, invalidateConversations);
    socket.on(SocketEvents.GROUP_UPDATED, invalidateConversations);
    socket.on(SocketEvents.GROUP_MEMBERS_ADDED, invalidateConversations);
    socket.on(SocketEvents.GROUP_ADMIN_TRANSFERRED, invalidateConversations);
    socket.on(SocketEvents.GROUP_MEMBER_JOINED, invalidateConversations);

    return () => {
      socket.off(SocketEvents.CONVERSATION_UPDATED, invalidateConversations);
      socket.off(SocketEvents.CONVERSATION_PINNED, invalidateConversations);
      socket.off(SocketEvents.CONVERSATION_UNPINNED, invalidateConversations);
      socket.off(SocketEvents.CONVERSATION_MUTED, invalidateConversations);
      socket.off(SocketEvents.GROUP_DISSOLVED, invalidateConversations);
      socket.off(SocketEvents.GROUP_MEMBER_REMOVED, invalidateConversations);
      socket.off(SocketEvents.GROUP_MEMBER_LEFT, invalidateConversations);
      socket.off(SocketEvents.GROUP_YOU_WERE_REMOVED, invalidateConversations);
      socket.off(SocketEvents.GROUP_UPDATED, invalidateConversations);
      socket.off(SocketEvents.GROUP_MEMBERS_ADDED, invalidateConversations);
      socket.off(SocketEvents.GROUP_ADMIN_TRANSFERRED, invalidateConversations);
      socket.off(SocketEvents.GROUP_MEMBER_JOINED, invalidateConversations);
    };
  }, [socket, isConnected, queryClient]);
}
