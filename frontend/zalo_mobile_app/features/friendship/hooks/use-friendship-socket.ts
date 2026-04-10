import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/providers/socket-provider';
import { useAuth } from '@/providers/auth-provider';
import { SocketEvents } from '@/constants/socket-events';
import { friendshipKeys } from '../api/friendship.api';
import Toast from 'react-native-toast-message';

export function useFriendshipSocket() {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleRequestReceived = (data: any) => {
      console.log('--- [FriendshipSocket] Request received:', data);
      const isRecipient = data.toUserId === user?.id;
      const isSender = data.fromUserId === user?.id;

      // Invalidate all friendship queries
      queryClient.invalidateQueries({
        queryKey: friendshipKeys.all,
        exact: false,
      });

      // Invalidate contacts list (user needs to disappear from discovery)
      queryClient.invalidateQueries({ queryKey: ['contacts'] });

      if (isRecipient) {
        Toast.show({
          type: 'info',
          text1: 'Lời mời kết bạn',
          text2: 'Bạn vừa nhận được một lời mời kết bạn mới',
        });
      }
    };

    const handleRequestAccepted = (data: any) => {
      console.log('--- [FriendshipSocket] Request accepted:', data);
      const wasRequester = data.requesterId === user?.id;

      queryClient.invalidateQueries({
        queryKey: friendshipKeys.all,
        exact: false,
      });

      // P1-D: Cross-sync contacts
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      // P1-D: Refresh conversation list because a new DIRECT conversation is created
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      
      if (wasRequester) {
        Toast.show({
          type: 'success',
          text1: 'Thành công',
          text2: 'Yêu cầu kết bạn của bạn đã được chấp nhận',
        });
      }
    };

    const handleGenericUpdate = (eventName: string) => (data: any) => {
      console.log(`--- [FriendshipSocket] ${eventName}:`, data);
      queryClient.invalidateQueries({
        queryKey: friendshipKeys.all,
        exact: false,
      });
      // P1-D: Cross-sync contacts (relevant for Cancel/Decline/Unfriend)
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    };

    socket.on(SocketEvents.FRIEND_REQUEST_RECEIVED, handleRequestReceived);
    socket.on(SocketEvents.FRIEND_REQUEST_ACCEPTED, handleRequestAccepted);
    socket.on(SocketEvents.FRIEND_REQUEST_CANCELLED, handleGenericUpdate('CANCELLED'));
    socket.on(SocketEvents.FRIEND_REQUEST_DECLINED, handleGenericUpdate('DECLINED'));
    socket.on(SocketEvents.FRI_UNFRIENDED, handleGenericUpdate('UNFRIENDED'));

    return () => {
      socket.off(SocketEvents.FRIEND_REQUEST_RECEIVED, handleRequestReceived);
      socket.off(SocketEvents.FRIEND_REQUEST_ACCEPTED, handleRequestAccepted);
      socket.off(SocketEvents.FRIEND_REQUEST_CANCELLED, handleGenericUpdate('CANCELLED'));
      socket.off(SocketEvents.FRIEND_REQUEST_DECLINED, handleGenericUpdate('DECLINED'));
      socket.off(SocketEvents.FRI_UNFRIENDED, handleGenericUpdate('UNFRIENDED'));
    };
  }, [socket, isConnected, queryClient]);
}
