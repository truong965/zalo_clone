import { useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth';
import {
      useAcceptRequest,
      useCancelRequest,
      useCheckStatus,
      useDeclineRequest,
      useReceivedRequests,
      useSendFriendRequest,
      useSentRequests,
} from '../api/friendship.api';
import type { FriendRequestWithUserDto } from '../types';

/**
 * Helper hook for ChatHeader (and other UI) to derive the "direction" of a
 * friend request between the current user and another user.
 *
 * This keeps the chat header logic simple while reusing the same underlying
 * queries/mutations as the friend-request list page.
 */
export function useFriendRequestStatus(otherUserId: string | null) {
      const currentUserId = useAuthStore((s) => s.user?.id ?? null);
      const queryClient = useQueryClient();

      const { data: friendshipStatus, isLoading: isCheckingFriendship } = useCheckStatus(
            otherUserId ?? null,
      );

      const receivedRequests = useReceivedRequests({ enabled: !!otherUserId });
      const sentRequests = useSentRequests({ enabled: !!otherUserId });

      const isLoading =
            isCheckingFriendship || receivedRequests.isLoading || sentRequests.isLoading;

      const sendRequest = useSendFriendRequest();
      const acceptRequest = useAcceptRequest();
      const declineRequest = useDeclineRequest();
      const cancelRequest = useCancelRequest();

      const requestSentByMe = useMemo<FriendRequestWithUserDto | null>(() => {
            if (!otherUserId || !sentRequests.data) return null;
            return (
                  sentRequests.data.pages
                        .flatMap((page) => page.data)
                        .find((r) => r.target.userId === otherUserId) ?? null
            );
      }, [otherUserId, sentRequests.data]);

      const requestReceivedFromOther = useMemo<FriendRequestWithUserDto | null>(() => {
            if (!otherUserId || !receivedRequests.data) return null;
            return (
                  receivedRequests.data.pages
                        .flatMap((page) => page.data)
                        .find((r) => r.requester.userId === otherUserId) ?? null
            );
      }, [otherUserId, receivedRequests.data]);

      const isFriend = friendshipStatus === 'ACCEPTED';
      const isPending = friendshipStatus === 'PENDING';

      const pendingRequestDirection = useMemo<
            'sent' | 'received' | null
      >(() => {
            if (!isPending) return null;
            if (requestSentByMe) return 'sent';
            if (requestReceivedFromOther) return 'received';
            return null;
      }, [isPending, requestSentByMe, requestReceivedFromOther]);

      const refreshStatus = useCallback(() => {
            void sentRequests.refetch();
            void receivedRequests.refetch();
            if (otherUserId) {
                  // Invalidate specifically for this user
                  queryClient.invalidateQueries({
                        queryKey: ['friendship', 'status', otherUserId],
                  });
            }
      }, [otherUserId, sentRequests, receivedRequests, queryClient]);

      return {
            currentUserId,
            otherUserId,
            friendshipStatus,
            isLoading,
            isCheckingFriendship,
            isFriend,
            isPending,
            pendingRequestDirection,
            sentRequest: requestSentByMe,
            receivedRequest: requestReceivedFromOther,
            sendRequest,
            acceptRequest,
            declineRequest,
            cancelRequest,
            refreshStatus,
            isSendingRequest: sendRequest.isPending,
            isAcceptingRequest: acceptRequest.isPending,
            isDecliningRequest: declineRequest.isPending,
            isCancellingRequest: cancelRequest.isPending,
      };
}
