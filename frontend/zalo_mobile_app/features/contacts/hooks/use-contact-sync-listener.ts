import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/providers/socket-provider';
import { SocketEvents } from '@/constants/socket-events';
import Toast from 'react-native-toast-message';
import { useContactSyncStore } from '../stores/contact-sync.store';

export function useContactSyncListener() {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();
  const setSuccess = useContactSyncStore((s) => s.setSuccess);

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleSyncCompleted = (data: any) => {
      console.log('--- [SyncSocket] Background sync completed:', data);
      
      // 1. Invalidate contacts cache to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      
      // 2. Clear background state and show success in modal
      setSuccess();
      
      // 3. Inform user via Toast
      Toast.show({
        type: 'success',
        text1: 'Đã hoàn tất đồng bộ',
        text2: `Đã cập nhật ${data.matchedCount} liên lạc từ danh bạ của bạn`,
      });
    };

    socket.on(SocketEvents.CONTACTS_SYNCED, handleSyncCompleted);
    return () => {
      socket.off(SocketEvents.CONTACTS_SYNCED, handleSyncCompleted);
    };
  }, [socket, isConnected, queryClient, setSuccess]);
}
