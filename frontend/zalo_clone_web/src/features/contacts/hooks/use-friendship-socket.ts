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
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { useFriendshipStore } from '../stores/friendship.store';
import { friendshipKeys, useReceivedRequests, useSentRequests } from '../api/friendship.api';
import { contactKeys } from './use-contact-check';

// Socket event names — must match backend SocketEvents constants
const FRIENDSHIP_SOCKET_EVENTS = {
      REQUEST_RECEIVED: 'friendship:requestReceived',
      REQUEST_ACCEPTED: 'friendship:requestAccepted',
      REQUEST_CANCELLED: 'friendship:requestCancelled',
      REQUEST_DECLINED: 'friendship:requestDeclined',
      UNFRIENDED: 'friendship:unfriended',
} as const;

type FriendRequestPayload = {
      friendshipId: string;
      fromUserId: string;
      toUserId: string;
};

type FriendRequestAcceptedPayload = {
      friendshipId: string;
      acceptedBy: string;
      requesterId: string;
};

type FriendRequestDeclinedPayload = {
      friendshipId: string;
      declinedBy: string;
      requesterId: string;
};

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
      const user = useAuthStore((s) => s.user);

      const incrementReceived = useFriendshipStore(
            (s) => s.incrementPendingReceived,
      );
      const decrementReceived = useFriendshipStore(
            (s) => s.decrementPendingReceived,
      );
      const incrementSent = useFriendshipStore((s) => s.incrementPendingSent);
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
                  const total = receivedData.pages.reduce((acc, page) => acc + page.data.length, 0);
                  setPendingReceivedCount(total);
            }
      }, [receivedData, setPendingReceivedCount]);

      useEffect(() => {
            if (sentData) {
                  const total = sentData.pages.reduce((acc, page) => acc + page.data.length, 0);
                  setPendingSentCount(total);
            }
      }, [sentData, setPendingSentCount]);

      const handleRequestReceived = useCallback(
            (payload: FriendRequestPayload) => {
                  const isRecipient = payload.toUserId === user?.id;
                  const isSender = payload.fromUserId === user?.id;

                  if (isRecipient) {
                        incrementReceived();
                        notification.info({
                              message: 'Lời mời kết bạn mới',
                              description: 'Bạn có lời mời kết bạn mới.',
                              placement: 'topRight',
                              duration: 5,
                        });
                  }

                  if (isSender) {
                        incrementSent();
                        // No notification for self-sent, but we need to update discovery list
                        // P1-D: Cross-sync contacts
                        void queryClient.invalidateQueries({ queryKey: ['contacts'] });
                        // P1-D: Refresh conversation list because a new DIRECT conversation is created
                        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
                  }

                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.receivedRequests(),
                  });
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.sentRequests(),
                  });
            },
            [incrementReceived, incrementSent, queryClient, user?.id],
      );

      const handleRequestAccepted = useCallback(
            (payload: FriendRequestAcceptedPayload) => {
                  const wasRequester = payload.requesterId === user?.id;
                  const wasAccepter = payload.acceptedBy === user?.id;

                  if (wasRequester) {
                        decrementSent();
                        notification.success({
                              message: 'Lời mời kết bạn được chấp nhận',
                              description: 'Lời mời kết bạn của bạn đã được chấp nhận.',
                              placement: 'topRight',
                              duration: 5,
                        });
                  }

                  if (wasAccepter) {
                        decrementReceived();
                        // No notification for self-accept, but we move user to friends list
                        void queryClient.invalidateQueries({
                              queryKey: friendshipKeys.receivedRequests(),
                        });
                  }

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
                  void queryClient.invalidateQueries({ queryKey: contactKeys.all });
                  // P1-D: Refresh conversation list because a new DIRECT conversation is created
                  void queryClient.invalidateQueries({ queryKey: ['conversations'] });
            },
            [decrementReceived, decrementSent, queryClient, user?.id],
      );

      const handleRequestCancelled = useCallback(
            (payload?: FriendRequestCancelledPayload) => {
                  const wasCanceller = payload?.cancelledBy === user?.id;
                  
                  if (wasCanceller) {
                        decrementSent();
                  } else {
                        decrementReceived();
                  }

                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.receivedRequests(),
                  });
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.sentRequests(),
                  });
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.count(),
                  });
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.all,
                        exact: false,
                  });
                  // P1-D: Cross-sync contacts (user might re-appear in discovery)
                  void queryClient.invalidateQueries({ queryKey: contactKeys.all });

                  if (payload?.cancelledBy) {
                        void queryClient.invalidateQueries({
                              queryKey: friendshipKeys.checkStatus(payload.cancelledBy),
                        });
                  }
            },
            [decrementReceived, decrementSent, queryClient, user?.id],
      );

      const handleRequestDeclined = useCallback(
            (payload?: FriendRequestDeclinedPayload) => {
                  const wasDecliner = payload?.declinedBy === user?.id;

                  if (wasDecliner) {
                        decrementReceived();
                  } else {
                        decrementSent();
                  }

                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.sentRequests(),
                  });
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.receivedRequests(),
                  });
                  // P1-D: Cross-sync contacts (user might re-appear in discovery)
                  void queryClient.invalidateQueries({ queryKey: contactKeys.all });
            },
            [decrementReceived, decrementSent, queryClient, user?.id],
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
