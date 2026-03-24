import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/providers/socket-provider';
import { JoinRequest } from '@/types/join-request';
import Toast from 'react-native-toast-message';
import { SocketEvents } from '@/constants/socket-events';
import { socketManager } from '@/lib/socket';

export function useJoinRequests(conversationId: string, isAdmin: boolean) {
  const { socket } = useSocket();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRequests = useCallback(async () => {
    if (!socket || !isAdmin) return;
    setIsLoading(true);
    try {
      const response = await socketManager.emitWithAck<JoinRequest[]>(
        'group:getPendingRequests',
        { conversationId }
      );
      setRequests(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error('[useJoinRequests] fetch error:', error);
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [socket, conversationId, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      fetchRequests();
    } else {
      setRequests([]);
    }

    if (!socket || !isAdmin) return;

    const handleNewRequest = (data: any) => {
      // Data might be { conversationId } or { conversationId, requesterId, ... }
      if (data && data.conversationId === conversationId) {
        fetchRequests();
      }
    };

    socket.on(SocketEvents.GROUP_JOIN_REQUEST_RECEIVED, handleNewRequest);
    // Also listen for reviewed events to stay in sync
    socket.on(SocketEvents.GROUP_JOIN_REQUEST_REVIEWED, handleNewRequest);

    return () => {
      socket.off(SocketEvents.GROUP_JOIN_REQUEST_RECEIVED, handleNewRequest);
      socket.off(SocketEvents.GROUP_JOIN_REQUEST_REVIEWED, handleNewRequest);
    };
  }, [socket, conversationId, fetchRequests, isAdmin]);

  const reviewRequest = useCallback(async (requestId: string, approve: boolean) => {
    if (!socket) return;

    try {
      const response = await socketManager.emitWithAck<{ success: boolean, message?: string }>(
        'group:reviewJoinRequest',
        {
          requestId,
          approve
        }
      );

      if (response && response.success) {
        setRequests((prev: any[]) => (Array.isArray(prev) ? prev : []).filter((r: any) => r.id !== requestId));
        Toast.show({
          type: 'success',
          text1: approve ? 'Đã chấp nhận' : 'Đã từ chối',
        });
      }
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error?.message || 'Không thể thực hiện yêu cầu',
      });
    }
  }, [socket]);

  return {
    requests,
    isLoading,
    reviewRequest,
    refresh: fetchRequests
  };
}

