/**
 * Friendship API — REST functions + TanStack Query hooks
 *
 * Handles all friendship-related API calls and provides
 * typed query/mutation hooks for components.
 */

import {
      useQuery,
      useMutation,
      useInfiniteQuery,
      useQueryClient,
      type UseQueryOptions,
} from '@tanstack/react-query';
import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/constants/api-endpoints';
import type {
      FriendWithUserDto,
      FriendRequestWithUserDto,
      MutualFriendDto,
      CursorPaginatedResponse,
      SendFriendRequestBody,
} from '../types';
import { contactKeys } from '../hooks/use-contact-check';

// ============================================================================
// Query Keys
// ============================================================================

export const friendshipKeys = {
      all: ['friendship'] as const,
      friendsList: (params?: { search?: string }) =>
            [...friendshipKeys.all, 'list', params] as const,
      receivedRequests: () => [...friendshipKeys.all, 'received'] as const,
      sentRequests: () => [...friendshipKeys.all, 'sent'] as const,
      checkStatus: (targetUserId: string) =>
            [...friendshipKeys.all, 'status', targetUserId] as const,
      mutual: (targetUserId: string) =>
            [...friendshipKeys.all, 'mutual', targetUserId] as const,
      count: () => [...friendshipKeys.all, 'count'] as const,
} as const;

// ============================================================================
// REST API Functions
// ============================================================================

async function getFriendsList(params?: {
      cursor?: string;
      limit?: number;
      search?: string;
}): Promise<CursorPaginatedResponse<FriendWithUserDto>> {
      const { data: response } = await apiClient.get(API_ENDPOINTS.FRIENDS.GET_ALL, {
            params,
      });
      // Backend wraps all responses in { statusCode, message, data }
      return response.data;
}

async function getReceivedRequests(): Promise<FriendRequestWithUserDto[]> {
      const { data: response } = await apiClient.get(API_ENDPOINTS.FRIENDS.GET_RECEIVED);
      return response.data;
}

async function getSentRequests(): Promise<FriendRequestWithUserDto[]> {
      const { data: response } = await apiClient.get(API_ENDPOINTS.FRIENDS.GET_SENT);
      return response.data;
}

async function sendFriendRequest(
      targetUserId: string,
): Promise<{ id: string }> {
      const body: SendFriendRequestBody = { targetUserId };
      const { data: response } = await apiClient.post(
            API_ENDPOINTS.FRIENDS.SEND_REQUEST,
            body,
      );
      return response.data;
}

async function acceptRequest(requestId: string): Promise<void> {
      await apiClient.put(API_ENDPOINTS.FRIENDS.ACCEPT_REQUEST(requestId));
}

async function declineRequest(requestId: string): Promise<void> {
      await apiClient.put(API_ENDPOINTS.FRIENDS.DECLINE_REQUEST(requestId));
}

async function cancelRequest(requestId: string): Promise<void> {
      await apiClient.delete(API_ENDPOINTS.FRIENDS.CANCEL_REQUEST(requestId));
}

async function unfriend(targetUserId: string): Promise<void> {
      await apiClient.delete(API_ENDPOINTS.FRIENDS.UNFRIEND(targetUserId));
}

async function checkFriendshipStatus(
      targetUserId: string,
): Promise<string | null> {
      const { data: response } = await apiClient.get(
            API_ENDPOINTS.FRIENDS.CHECK_STATUS(targetUserId),
      );
      return response.data;
}

async function getMutualFriends(
      targetUserId: string,
): Promise<MutualFriendDto[]> {
      const { data: response } = await apiClient.get(
            API_ENDPOINTS.FRIENDS.MUTUAL(targetUserId),
      );
      return response.data;
}

async function getFriendCount(): Promise<{ count: number }> {
      const { data: response } = await apiClient.get(API_ENDPOINTS.FRIENDS.COUNT);
      return response.data;
}

// ============================================================================
// TanStack Query Hooks
// ============================================================================

/**
 * Infinite query for friends list with cursor pagination.
 */
export function useFriendsList(params?: { search?: string; limit?: number }) {
      const limit = params?.limit ?? 20;

      return useInfiniteQuery({
            queryKey: friendshipKeys.friendsList({ search: params?.search }),
            initialPageParam: undefined as string | undefined,
            queryFn: ({ pageParam }) =>
                  getFriendsList({ cursor: pageParam, limit, search: params?.search }),
            getNextPageParam: (lastPage) =>
                  lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
            staleTime: 30_000,
      });
}

/**
 * Query for received friend requests.
 */
export function useReceivedRequests(
      options?: Partial<UseQueryOptions<FriendRequestWithUserDto[]>>,
) {
      return useQuery({
            queryKey: friendshipKeys.receivedRequests(),
            queryFn: getReceivedRequests,
            staleTime: 10_000,
            ...options,
      });
}

/**
 * Query for sent friend requests.
 */
export function useSentRequests(
      options?: Partial<UseQueryOptions<FriendRequestWithUserDto[]>>,
) {
      return useQuery({
            queryKey: friendshipKeys.sentRequests(),
            queryFn: getSentRequests,
            staleTime: 10_000,
            ...options,
      });
}

/**
 * On-demand query to check friendship status with a user.
 */
export function useCheckStatus(
      targetUserId: string | null,
      options?: Partial<UseQueryOptions<string | null>>,
) {
      return useQuery({
            queryKey: friendshipKeys.checkStatus(targetUserId ?? ''),
            queryFn: () => checkFriendshipStatus(targetUserId!),
            enabled: !!targetUserId,
            staleTime: 60_000,
            ...options,
      });
}

/**
 * Query for mutual friends with a specific user.
 */
export function useMutualFriends(
      targetUserId: string | null,
      options?: Partial<UseQueryOptions<MutualFriendDto[]>>,
) {
      return useQuery({
            queryKey: friendshipKeys.mutual(targetUserId ?? ''),
            queryFn: () => getMutualFriends(targetUserId!),
            enabled: !!targetUserId,
            staleTime: 60_000,
            ...options,
      });
}

/**
 * Query for friend count.
 */
export function useFriendCount() {
      return useQuery({
            queryKey: friendshipKeys.count(),
            queryFn: getFriendCount,
            staleTime: 30_000,
            select: (data) => data.count,
      });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Send a friend request — invalidates received/sent queries.
 */
export function useSendFriendRequest() {
      const queryClient = useQueryClient();

      return useMutation({
            mutationFn: (targetUserId: string) => sendFriendRequest(targetUserId),
            onSuccess: () => {
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.sentRequests(),
                  });
            },
      });
}

/**
 * Accept a friend request — invalidates friendsList + received.
 */
export function useAcceptRequest() {
      const queryClient = useQueryClient();

      return useMutation({
            mutationFn: (requestId: string) => acceptRequest(requestId),
            onSuccess: () => {
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.friendsList(),
                  });
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.receivedRequests(),
                  });
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.count(),
                  });
                  // P1-D: Cross-invalidate contacts (friend moved out of excludeFriends list)
                  void queryClient.invalidateQueries({ queryKey: contactKeys.all });
            },
      });
}

/**
 * Decline a friend request — invalidates received.
 */
export function useDeclineRequest() {
      const queryClient = useQueryClient();

      return useMutation({
            mutationFn: (requestId: string) => declineRequest(requestId),
            onSuccess: () => {
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.receivedRequests(),
                  });
            },
      });
}

/**
 * Cancel a sent friend request — invalidates sent.
 */
export function useCancelRequest() {
      const queryClient = useQueryClient();

      return useMutation({
            mutationFn: (requestId: string) => cancelRequest(requestId),
            onSuccess: () => {
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.sentRequests(),
                  });
            },
      });
}

/**
 * Unfriend a user — invalidates friendsList + count.
 */
export function useUnfriend() {
      const queryClient = useQueryClient();

      return useMutation({
            mutationFn: (targetUserId: string) => unfriend(targetUserId),
            onSuccess: () => {
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.friendsList(),
                  });
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.count(),
                  });
                  // P1-D: Cross-invalidate contacts (user re-appears in excludeFriends list)
                  void queryClient.invalidateQueries({ queryKey: contactKeys.all });
            },
      });
}

// Export raw API functions for direct usage if needed
export const friendshipApi = {
      getFriendsList,
      getReceivedRequests,
      getSentRequests,
      sendFriendRequest,
      acceptRequest,
      declineRequest,
      cancelRequest,
      unfriend,
      checkFriendshipStatus,
      getMutualFriends,
      getFriendCount,
} as const;
