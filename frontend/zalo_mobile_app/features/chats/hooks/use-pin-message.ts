import { useCallback, useEffect } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { useSocket } from '@/providers/socket-provider';
import { SocketEvents } from '@/constants/socket-events';

export const pinnedMessagesKey = (conversationId: string | null) =>
  ['conversations', 'pinned-messages', conversationId] as const;

export function usePinMessage(conversationId: string | null) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  const query = useQuery({
    queryKey: pinnedMessagesKey(conversationId),
    queryFn: () => mobileApi.getPinnedMessages(conversationId!, accessToken!),
    enabled: !!conversationId && !!accessToken,
    staleTime: 60_000,
  });

  const pinMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!socket) throw new Error('Socket not connected');
      return new Promise((resolve, reject) => {
        socket.emitWithAck(SocketEvents.CONVERSATION_PIN_MESSAGE, {
          conversationId,
          messageId,
        }).then(resolve).catch(reject);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pinnedMessagesKey(conversationId),
      });
    },
  });

  const unpinMutation = useMutation({
    mutationFn: async (messageId: string) => {
      if (!socket) throw new Error('Socket not connected');
      return new Promise((resolve, reject) => {
        socket.emitWithAck(SocketEvents.CONVERSATION_UNPIN_MESSAGE, {
          conversationId,
          messageId,
        }).then(resolve).catch(reject);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: pinnedMessagesKey(conversationId),
      });
    },
  });

  useEffect(() => {
    if (!socket || !conversationId) return;

    const handlePinned = (data: { conversationId: string }) => {
      if (data.conversationId === conversationId) {
        queryClient.invalidateQueries({
          queryKey: pinnedMessagesKey(conversationId),
        });
      }
    };

    const handleUnpinned = (data: { conversationId: string }) => {
      if (data.conversationId === conversationId) {
        queryClient.invalidateQueries({
          queryKey: pinnedMessagesKey(conversationId),
        });
      }
    };

    socket.on(SocketEvents.CONVERSATION_MESSAGE_PINNED as any, handlePinned);
    socket.on(SocketEvents.CONVERSATION_MESSAGE_UNPINNED as any, handleUnpinned);

    return () => {
      socket.off(SocketEvents.CONVERSATION_MESSAGE_PINNED as any, handlePinned);
      socket.off(SocketEvents.CONVERSATION_MESSAGE_UNPINNED as any, handleUnpinned);
    };
  }, [socket, conversationId, queryClient]);

  const pinMessage = useCallback(
    (messageId: string, options?: UseMutationOptions<any, any, string, any>) =>
      pinMutation.mutate(messageId, options),
    [pinMutation],
  );

  const unpinMessage = useCallback(
    (messageId: string, options?: UseMutationOptions<any, any, string, any>) =>
      unpinMutation.mutate(messageId, options),
    [unpinMutation],
  );

  return {
    pinnedMessages: query.data ?? [],
    isLoading: query.isLoading,
    pinMessage,
    unpinMessage,
    isPinning: pinMutation.isPending,
    isUnpinning: unpinMutation.isPending,
  };
}
