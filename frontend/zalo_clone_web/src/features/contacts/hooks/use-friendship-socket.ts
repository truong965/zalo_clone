/**
 * useFriendshipSocket — Realtime friendship event handler
 *
 * Listens to friendship-related socket events and:
 * 1. Updates badge counts in Zustand store
 * 2. Invalidates relevant TanStack Query caches
 * 3. Shows notifications to the user
 *
 * This hook should be mounted at a top-level layout component
 * so friendship notifications are received regardless of which page
 * the user is viewing.
 */

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notification } from 'antd';
import { useSocket } from '@/hooks/use-socket';
import { useFriendshipStore } from '../stores/friendship.store';
import { friendshipKeys, useReceivedRequests, useSentRequests } from '../api/friendship.api';

// Socket event names — must match backend SocketEvents constants
const FRIENDSHIP_SOCKET_EVENTS = {
      REQUEST_RECEIVED: 'friendship:requestReceived',
      REQUEST_ACCEPTED: 'friendship:requestAccepted',
      REQUEST_CANCELLED: 'friendship:requestCancelled',
      REQUEST_DECLINED: 'friendship:requestDeclined',
      UNFRIENDED: 'friendship:unfriended',
} as const;

type FriendRequestCancelledPayload = {
      friendshipId: string;
      cancelledBy: string;
      targetUserId: string;
};

type UnfriendedPayload = {
      friendshipId: string;
      initiatedBy: string;
      userId: string;
};

export function useFriendshipSocket() {
      const { socket, isConnected } = useSocket();
      const queryClient = useQueryClient();

      const incrementReceived = useFriendshipStore(
            (s) => s.incrementPendingReceived,
      );
      const decrementReceived = useFriendshipStore(
            (s) => s.decrementPendingReceived,
      );
      const decrementSent = useFriendshipStore((s) => s.decrementPendingSent);

      // Bug 6: Fetch initial badge counts on mount so they survive F5 refresh
      const setPendingReceivedCount = useFriendshipStore(
            (s) => s.setPendingReceivedCount,
      );
      const setPendingSentCount = useFriendshipStore(
            (s) => s.setPendingSentCount,
      );

      const { data: receivedData } = useReceivedRequests();
      const { data: sentData } = useSentRequests();

      useEffect(() => {
            if (receivedData) {
                  setPendingReceivedCount(receivedData.length);
            }
      }, [receivedData, setPendingReceivedCount]);

      useEffect(() => {
            if (sentData) {
                  setPendingSentCount(sentData.length);
            }
      }, [sentData, setPendingSentCount]);

      const handleRequestReceived = useCallback(
            () => {
                  incrementReceived();
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.receivedRequests(),
                  });
                  notification.info({
                        message: 'Lời mời kết bạn mới',
                        description: 'Bạn có lời mời kết bạn mới.',
                        placement: 'topRight',
                        duration: 5,
                  });
            },
            [incrementReceived, queryClient],
      );

      const handleRequestAccepted = useCallback(
            () => {
                  decrementSent();
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.all,
                        exact: false,
                  });

                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.sentRequests(),
                  });
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.count(),
                  });
                  // P1-D: Cross-invalidate contacts (excludeFriends filter depends on friend list)
                  void queryClient.invalidateQueries({ queryKey: ['contacts', 'list'] });
                  notification.success({
                        message: 'Lời mời kết bạn được chấp nhận',
                        description: 'Lời mời kết bạn của bạn đã được chấp nhận.',
                        placement: 'topRight',
                        duration: 5,
                  });
            },
            [decrementSent, queryClient],
      );

      const handleRequestCancelled = useCallback(
            (payload?: FriendRequestCancelledPayload) => {
                  decrementReceived();
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.receivedRequests(),
                  });
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.count(),
                  });
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.all,
                        exact: false,
                  });

                  if (payload?.cancelledBy) {
                        void queryClient.invalidateQueries({
                              queryKey: friendshipKeys.checkStatus(payload.cancelledBy),
                        });
                  }
            },
            [decrementReceived, queryClient],
      );

      const handleRequestDeclined = useCallback(
            () => {
                  decrementSent();
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.sentRequests(),
                  });
            },
            [decrementSent, queryClient],
      );

      const handleUnfriended = useCallback(
            (payload?: UnfriendedPayload) => {
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.all,
                        exact: false,
                  });
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.count(),
                  });
                  // P1-D: Cross-invalidate contacts (excludeFriends filter depends on friend list)
                  void queryClient.invalidateQueries({ queryKey: ['contacts', 'list'] });

                  if (payload?.initiatedBy) {
                        void queryClient.invalidateQueries({
                              queryKey: friendshipKeys.checkStatus(payload.initiatedBy),
                        });
                  }
            },
            [queryClient],
      );

      useEffect(() => {
            if (!socket || !isConnected) return;

            socket.on(
                  FRIENDSHIP_SOCKET_EVENTS.REQUEST_RECEIVED,
                  handleRequestReceived,
            );
            socket.on(
                  FRIENDSHIP_SOCKET_EVENTS.REQUEST_ACCEPTED,
                  handleRequestAccepted,
            );
            socket.on(
                  FRIENDSHIP_SOCKET_EVENTS.REQUEST_CANCELLED,
                  handleRequestCancelled,
            );
            socket.on(
                  FRIENDSHIP_SOCKET_EVENTS.REQUEST_DECLINED,
                  handleRequestDeclined,
            );
            socket.on(FRIENDSHIP_SOCKET_EVENTS.UNFRIENDED, handleUnfriended);

            return () => {
                  socket.off(
                        FRIENDSHIP_SOCKET_EVENTS.REQUEST_RECEIVED,
                        handleRequestReceived,
                  );
                  socket.off(
                        FRIENDSHIP_SOCKET_EVENTS.REQUEST_ACCEPTED,
                        handleRequestAccepted,
                  );
                  socket.off(
                        FRIENDSHIP_SOCKET_EVENTS.REQUEST_CANCELLED,
                        handleRequestCancelled,
                  );
                  socket.off(
                        FRIENDSHIP_SOCKET_EVENTS.REQUEST_DECLINED,
                        handleRequestDeclined,
                  );
                  socket.off(FRIENDSHIP_SOCKET_EVENTS.UNFRIENDED, handleUnfriended);
            };
      }, [
            socket,
            isConnected,
            handleRequestReceived,
            handleRequestAccepted,
            handleRequestCancelled,
            handleRequestDeclined,
            handleUnfriended,
      ]);
}
