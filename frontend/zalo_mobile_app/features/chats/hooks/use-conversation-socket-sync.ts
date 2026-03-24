import React from 'react';
import { useSocket } from '@/providers/socket-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { SocketEvents } from '@/constants/socket-events';

export function useConversationSocketSync(id: string, currentUserId?: string) {
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const router = useRouter();

  React.useEffect(() => {
    if (!socket || !id) return;

    const removeConversationFromList = (conversationId: string) => {
      queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData: any) => {
        if (!oldData || !oldData.pages) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: any) => ({
            ...page,
            data: page.data.filter((c: any) => c.id !== conversationId),
          })),
        };
      });
    };

    const handleAdminTransferred = (data: { conversationId: string; newAdminId: string }) => {
      if (data.conversationId === id) {
        queryClient.invalidateQueries({ queryKey: ['conversation', id] });
        queryClient.invalidateQueries({ queryKey: ['conversation-members', id] });
        Toast.show({ type: 'info', text1: 'Thông báo', text2: 'Quyền trưởng nhóm đã được thay đổi' });
      }
    };

    const handleGroupDissolved = (data: { conversationId: string }) => {
      if (data.conversationId === id) {
        Toast.show({ type: 'info', text1: 'Thông báo', text2: 'Nhóm đã giải tán' });
        removeConversationFromList(id);
        router.dismissAll();
        router.replace('/(tabs)');
      }
    };

    const handleMemberRemoved = (data: { conversationId: string; userId: string }) => {
      if (data.conversationId === id) {
        if (data.userId === currentUserId) {
          Toast.show({ type: 'info', text1: 'Thông báo', text2: 'Bạn đã bị mời ra khỏi nhóm' });
          removeConversationFromList(id);
          router.dismissAll();
          router.replace('/(tabs)');
        } else {
          queryClient.invalidateQueries({ queryKey: ['conversation', id] });
          queryClient.invalidateQueries({ queryKey: ['conversation-members', id] });
        }
      }
    };

    const handleGroupUpdated = (data: { conversationId: string }) => {
      if (data.conversationId === id) {
        queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      }
    };

    const handleMemberLeft = (data: { conversationId: string; memberId: string }) => {
      if (data.conversationId === id) {
        if (data.memberId === currentUserId) {
          removeConversationFromList(id);
          router.dismissAll();
          router.replace('/(tabs)');
        } else {
          queryClient.invalidateQueries({ queryKey: ['conversation', id] });
          queryClient.invalidateQueries({ queryKey: ['conversation-members', id] });
        }
      }
    };

    const handleRefreshMembers = (data: { conversationId: string }) => {
      if (data.conversationId === id) {
        queryClient.invalidateQueries({ queryKey: ['conversation', id] });
        queryClient.invalidateQueries({ queryKey: ['conversation-members', id] });
      }
    };

    const handleConversationSync = (data: { conversationId: string }) => {
      if (data.conversationId === id) {
        queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      }
    };

    socket.on(SocketEvents.GROUP_ADMIN_TRANSFERRED, handleAdminTransferred);
    socket.on(SocketEvents.GROUP_DISSOLVED, handleGroupDissolved);
    socket.on(SocketEvents.GROUP_MEMBER_REMOVED, handleMemberRemoved);
    socket.on(SocketEvents.GROUP_YOU_WERE_REMOVED, () => handleMemberRemoved({ conversationId: id, userId: currentUserId || '' }));
    socket.on(SocketEvents.GROUP_UPDATED, handleGroupUpdated);
    socket.on(SocketEvents.GROUP_MEMBERS_ADDED, handleRefreshMembers);
    socket.on(SocketEvents.GROUP_MEMBER_LEFT, handleMemberLeft);
    socket.on(SocketEvents.GROUP_MEMBER_JOINED, handleRefreshMembers);

    // Sync pinned/muted status and other conversation updates
    socket.on(SocketEvents.CONVERSATION_PINNED, handleConversationSync);
    socket.on(SocketEvents.CONVERSATION_UNPINNED, handleConversationSync);
    socket.on(SocketEvents.CONVERSATION_MUTED, handleConversationSync);
    socket.on(SocketEvents.CONVERSATION_UPDATED, handleConversationSync);

    return () => {
      socket.off(SocketEvents.GROUP_ADMIN_TRANSFERRED, handleAdminTransferred);
      socket.off(SocketEvents.GROUP_DISSOLVED, handleGroupDissolved);
      socket.off(SocketEvents.GROUP_MEMBER_REMOVED, handleMemberRemoved);
      socket.off(SocketEvents.GROUP_YOU_WERE_REMOVED);
      socket.off(SocketEvents.GROUP_UPDATED, handleGroupUpdated);
      socket.off(SocketEvents.GROUP_MEMBERS_ADDED, handleRefreshMembers);
      socket.off(SocketEvents.GROUP_MEMBER_LEFT, handleMemberLeft);
      socket.off(SocketEvents.GROUP_MEMBER_JOINED, handleRefreshMembers);

      socket.off(SocketEvents.CONVERSATION_PINNED, handleConversationSync);
      socket.off(SocketEvents.CONVERSATION_UNPINNED, handleConversationSync);
      socket.off(SocketEvents.CONVERSATION_MUTED, handleConversationSync);
      socket.off(SocketEvents.CONVERSATION_UPDATED, handleConversationSync);
    };
  }, [socket, id, queryClient, currentUserId, router]);
}
