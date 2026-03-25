import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';

// ============================================================================
// Query Keys
// ============================================================================

export const friendshipKeys = {
      all: ['friendship'] as const,
      receivedRequests: () => [...friendshipKeys.all, 'received'] as const,
      sentRequests: () => [...friendshipKeys.all, 'sent'] as const,
      checkStatus: (targetUserId: string) => [...friendshipKeys.all, 'status', targetUserId] as const,
} as const;

// ============================================================================
// Query Hooks
// ============================================================================

export function useReceivedRequests(options?: { enabled?: boolean }) {
      const { accessToken } = useAuth();
      return useQuery({
            queryKey: friendshipKeys.receivedRequests(),
            queryFn: () => {
                  if (!accessToken) throw new Error("No access token");
                  return mobileApi.getReceivedFriendRequests(accessToken);
            },
            enabled: options?.enabled !== false && !!accessToken,
      });
}

export function useSentRequests(options?: { enabled?: boolean }) {
      const { accessToken } = useAuth();
      return useQuery({
            queryKey: friendshipKeys.sentRequests(),
            queryFn: () => {
                  if (!accessToken) throw new Error("No access token");
                  return mobileApi.getSentFriendRequests(accessToken);
            },
            enabled: options?.enabled !== false && !!accessToken,
      });
}

export function useCheckStatus(targetUserId: string | null, options?: { enabled?: boolean }) {
      const { accessToken } = useAuth();
      return useQuery({
            queryKey: friendshipKeys.checkStatus(targetUserId ?? ''),
            queryFn: async () => {
                  if (!accessToken || !targetUserId) throw new Error("Missing params");
                  const res = await mobileApi.checkFriendshipStatus(targetUserId, accessToken);
                  return res.status;
            },
            enabled: options?.enabled !== false && !!accessToken && !!targetUserId,
            staleTime: 10_000,
      });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useSendFriendRequest(
      options?: import('@tanstack/react-query').UseMutationOptions<
            { id: string },
            Error,
            string
      >,
) {
      const queryClient = useQueryClient();
      const { accessToken } = useAuth();

      return useMutation({
            mutationFn: (targetUserId: string) => {
                  if (!accessToken) throw new Error("No access token");
                  return mobileApi.sendFriendRequest(targetUserId, accessToken);
            },
            onSuccess: (...args) => {
                  queryClient.invalidateQueries({
                        queryKey: friendshipKeys.all,
                        exact: false,
                  });
                  options?.onSuccess?.(...args);
            },
            ...options,
      });
}

export function useAcceptRequest(
      options?: import('@tanstack/react-query').UseMutationOptions<
            void,
            Error,
            string
      >
) {
      const queryClient = useQueryClient();
      const { accessToken } = useAuth();

      return useMutation({
            mutationFn: (requestId: string) => {
                  if (!accessToken) throw new Error("No access token");
                  return mobileApi.acceptFriendRequest(requestId, accessToken);
            },
            onSuccess: (...args) => {
                  queryClient.invalidateQueries({
                        queryKey: friendshipKeys.all,
                        exact: false,
                  });
                  options?.onSuccess?.(...args);
            },
            ...options
      });
}

export function useDeclineRequest(
      options?: import('@tanstack/react-query').UseMutationOptions<
            void,
            Error,
            string
      >
) {
      const queryClient = useQueryClient();
      const { accessToken } = useAuth();

      return useMutation({
            mutationFn: (requestId: string) => {
                  if (!accessToken) throw new Error("No access token");
                  return mobileApi.declineFriendRequest(requestId, accessToken);
            },
            onSuccess: (...args) => {
                  queryClient.invalidateQueries({
                        queryKey: friendshipKeys.all,
                        exact: false,
                  });
                  options?.onSuccess?.(...args);
            },
            ...options
      });
}

export function useCancelRequest(
      options?: import('@tanstack/react-query').UseMutationOptions<
            void,
            Error,
            string
      >
) {
      const queryClient = useQueryClient();
      const { accessToken } = useAuth();

      return useMutation({
            mutationFn: (requestId: string) => {
                  if (!accessToken) throw new Error("No access token");
                  return mobileApi.cancelFriendRequest(requestId, accessToken);
            },
            onSuccess: (...args) => {
                  queryClient.invalidateQueries({
                        queryKey: friendshipKeys.all,
                        exact: false,
                  });
                  options?.onSuccess?.(...args);
            },
            ...options
      });
}
