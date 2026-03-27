import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/providers/socket-provider';
import { SocketEvents } from '@/constants/socket-events';
import { friendshipKeys } from '../api/friendship.api';
import Toast from 'react-native-toast-message';

export function useFriendshipSocket() {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleRequestReceived = (data: any) => {
      console.log('--- [FriendshipSocket] Request received:', data);
      
      // Invalidate all friendship queries to ensure UI is up-to-date
      queryClient.invalidateQueries({
        queryKey: friendshipKeys.all,
        exact: false,
      });

      Toast.show({
        type: 'info',
        text1: 'Lời mời kết bạn',
        text2: 'Bạn vừa nhận được một lời mời kết bạn mới',
        onPress: () => {
          // Provide a way to navigate or just dismiss
          Toast.hide();
        }
      });
    };

    const handleRequestAccepted = (data: any) => {
      console.log('--- [FriendshipSocket] Request accepted:', data);
      queryClient.invalidateQueries({
        queryKey: friendshipKeys.all,
        exact: false,
      });
      
      Toast.show({
        type: 'success',
        text1: 'Thành công',
        text2: 'Yêu cầu kết bạn của bạn đã được chấp nhận',
      });
    };

    const handleGenericUpdate = (eventName: string) => (data: any) => {
      console.log(`--- [FriendshipSocket] ${eventName}:`, data);
      queryClient.invalidateQueries({
        queryKey: friendshipKeys.all,
        exact: false,
      });
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
