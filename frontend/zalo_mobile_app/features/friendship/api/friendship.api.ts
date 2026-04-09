import { useMutation, useQueryClient, useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { Friend, FriendRequest } from '@/types/friendship';
import Toast from 'react-native-toast-message';

// ============================================================================
// Query Keys
// ============================================================================

export const friendshipKeys = {
      all: ['friendship'] as const,
      friendsList: (params?: { search?: string; conversationId?: string }) =>
            [...friendshipKeys.all, 'list', params] as const,
      receivedRequests: () => [...friendshipKeys.all, 'received'] as const,
      sentRequests: () => [...friendshipKeys.all, 'sent'] as const,
      checkStatus: (targetUserId: string) => [...friendshipKeys.all, 'status', targetUserId] as const,
      groups: (params?: { search?: string }) => [...friendshipKeys.all, 'groups', params] as const,
} as const;

// ============================================================================
// Query Hooks
// ============================================================================

export function useReceivedRequests(params?: { limit?: number }, options?: { enabled?: boolean }) {
      const { accessToken } = useAuth();
      const limit = params?.limit ?? 20;

      return useInfiniteQuery({
            queryKey: friendshipKeys.receivedRequests(),
            initialPageParam: undefined as string | undefined,
            queryFn: async ({ pageParam }) => {
                  if (!accessToken) throw new Error("No access token");
                  return mobileApi.getReceivedFriendRequests(accessToken, {
                        cursor: pageParam,
                        limit,
                  });
            },
            getNextPageParam: (lastPage: any) =>
                  lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
            enabled: options?.enabled !== false && !!accessToken,
      });
}

export function useSentRequests(params?: { limit?: number }, options?: { enabled?: boolean }) {
      const { accessToken } = useAuth();
      const limit = params?.limit ?? 20;

      return useInfiniteQuery({
            queryKey: friendshipKeys.sentRequests(),
            initialPageParam: undefined as string | undefined,
            queryFn: async ({ pageParam }) => {
                  if (!accessToken) throw new Error("No access token");
                  return mobileApi.getSentFriendRequests(accessToken, {
                        cursor: pageParam,
                        limit,
                  });
            },
            getNextPageParam: (lastPage: any) =>
                  lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
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

export function useFriendsList(params?: { search?: string; limit?: number; conversationId?: string }) {
      const { accessToken } = useAuth();
      const limit = params?.limit ?? 20;

      return useInfiniteQuery({
            queryKey: friendshipKeys.friendsList({ 
                  search: params?.search,
                  conversationId: params?.conversationId,
            }),
            initialPageParam: undefined as string | undefined,
            queryFn: ({ pageParam }) => {
                  if (!accessToken) throw new Error("No access token");
                  return mobileApi.getFriends(accessToken, { 
                        cursor: pageParam, 
                        limit, 
                        search: params?.search,
                        conversationId: params?.conversationId,
                  });
            },
            getNextPageParam: (lastPage: any) =>
                  lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
            staleTime: 30_000,
            enabled: !!accessToken,
      });
}

export function useGroups(params?: { search?: string; limit?: number }) {
      const { accessToken } = useAuth();
      const limit = params?.limit ?? 20;

      return useInfiniteQuery({
            queryKey: friendshipKeys.groups({ search: params?.search }),
            initialPageParam: undefined as string | undefined,
            queryFn: ({ pageParam }) => {
                  if (!accessToken) throw new Error("No access token");
                  return mobileApi.getGroups(accessToken, { 
                        cursor: pageParam, 
                        limit, 
                        search: params?.search,
                  });
            },
            getNextPageParam: (lastPage: any) =>
                  lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
            staleTime: 30_000,
            enabled: !!accessToken,
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
            onError: (...args) => {
                  if (options?.onError) {
                        options.onError(...args);
                        return;
                  }
                  const error = args[0] as any;
                  Toast.show({
                        type: 'error',
                        text1: 'Lỗi',
                        text2: error?.message || 'Không thể gửi yêu cầu kết bạn',
                  });
            },
            onSuccess: (...args) => {
                  queryClient.invalidateQueries({
                        queryKey: friendshipKeys.all,
                        exact: false,
                  });
                  // P1-D: Cross-invalidate contacts (user moved to PENDING, should be excluded from contacts list)
                  queryClient.invalidateQueries({ queryKey: ['contacts'] });
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
            onError: (...args) => {
                  if (options?.onError) {
                        options.onError(...args);
                        return;
                  }
                  const error = args[0] as any;
                  Toast.show({
                        type: 'error',
                        text1: 'Lỗi',
                        text2: error?.message || 'Không thể chấp nhận yêu cầu kết bạn',
                  });
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
            onError: (...args) => {
                  if (options?.onError) {
                        options.onError(...args);
                        return;
                  }
                  const error = args[0] as any;
                  Toast.show({
                        type: 'error',
                        text1: 'Lỗi',
                        text2: error?.message || 'Không thể từ chối yêu cầu kết bạn',
                  });
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
            onError: (...args) => {
                  if (options?.onError) {
                        options.onError(...args);
                        return;
                  }
                  const error = args[0] as any;
                  Toast.show({
                        type: 'error',
                        text1: 'Lỗi',
                        text2: error?.message || 'Không thể hủy yêu cầu kết bạn',
                  });
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

export function useGetOrCreateDirectConversation(
      options?: import('@tanstack/react-query').UseMutationOptions<
            import('@/types/conversation').Conversation,
            Error,
            string
      >
) {
      const { accessToken } = useAuth();

      return useMutation({
            mutationFn: (recipientId: string) => {
                  if (!accessToken) throw new Error("No access token");
                  return mobileApi.getOrCreateDirectConversation(recipientId, accessToken);
            },
            ...options,
      });
}
