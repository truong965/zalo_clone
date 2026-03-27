import { useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useReceivedRequests, useSentRequests, useCheckStatus, friendshipKeys } from '../api/friendship.api';

/**
 * Ported from Web: Helper hook to derive friendship status and request direction.
 */
export function useFriendRequestStatus(otherUserId: string | null) {
      const queryClient = useQueryClient();

      const { data: friendshipStatus, isLoading: isCheckingFriendship } = useCheckStatus(
            otherUserId ?? null,
      );

      const receivedRequests = useReceivedRequests(undefined, { enabled: !!otherUserId });
      const sentRequests = useSentRequests(undefined, { enabled: !!otherUserId });

      const isLoading =
            isCheckingFriendship || receivedRequests.isLoading || sentRequests.isLoading;

      const isFriend = friendshipStatus === 'ACCEPTED';
      const isPending = friendshipStatus === 'PENDING';

      const requestSentByMe = useMemo(() => {
            if (!otherUserId || !sentRequests.data) return null;
            for (const page of sentRequests.data.pages) {
                  const found = page.data.find((r: any) => (r.target?.userId || r.targetId) === otherUserId);
                  if (found) return found;
            }
            return null;
      }, [otherUserId, sentRequests.data]);

      const requestReceivedFromOther = useMemo(() => {
            if (!otherUserId || !receivedRequests.data) return null;
            for (const page of receivedRequests.data.pages) {
                  const found = page.data.find((r: any) => (r.requester?.userId || r.requesterId) === otherUserId);
                  if (found) return found;
            }
            return null;
      }, [otherUserId, receivedRequests.data]);

      const pendingRequestDirection = useMemo<'OUTGOING' | 'INCOMING' | null>(() => {
            // Only show direction if the overall status is PENDING
            if (!isPending) return null;
            if (requestSentByMe) return 'OUTGOING';
            if (requestReceivedFromOther) return 'INCOMING';
            return null;
      }, [isPending, requestSentByMe, requestReceivedFromOther]);

      const refreshStatus = useCallback(() => {
            void sentRequests.refetch();
            void receivedRequests.refetch();
            if (otherUserId) {
                  queryClient.invalidateQueries({
                        queryKey: friendshipKeys.checkStatus(otherUserId),
                  });
            }
      }, [otherUserId, sentRequests, receivedRequests, queryClient]);

      return {
            isLoading,
            isFriend,
            isPending,
            pendingRequestDirection,
            sentRequest: requestSentByMe,
            receivedRequest: requestReceivedFromOther,
            refreshStatus,
            friendshipStatus,
      };
}
