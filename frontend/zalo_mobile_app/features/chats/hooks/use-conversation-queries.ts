import { useInfiniteQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { Friend } from '@/types/friendship';

export function useFriendsList(params?: { search?: string; enabled?: boolean; excludeIds?: string[]; conversationId?: string }) {
  const { accessToken } = useAuth();
  const search = params?.search;
  const enabled = params?.enabled ?? true;
  const excludeIds = params?.excludeIds;
  const conversationId = params?.conversationId;

  // Filter out undefined/falsy values from excludeIds
  const cleanExcludeIds = excludeIds?.filter(Boolean);

  return useInfiniteQuery({
    queryKey: ['friends', search, cleanExcludeIds, conversationId],
    queryFn: async ({ pageParam }) => {
      const response = await mobileApi.getFriends(accessToken!, {
        search: search || undefined,
        cursor: pageParam,
        limit: 20,
        excludeIds: cleanExcludeIds,
        conversationId,
      });
      return {
        data: response.data as Friend[],
        meta: response.meta,
      };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
    enabled: !!accessToken && enabled,
    staleTime: 30_000,
  });
}

export function useContactSearch(params: {
  keyword: string;
  limit?: number;
  excludeIds?: string[];
  conversationId?: string;
  enabled?: boolean;
}) {
  const { accessToken } = useAuth();
  const { keyword, limit = 20, excludeIds, conversationId, enabled = true } = params;

  // Filter out undefined/falsy values from excludeIds
  const cleanExcludeIds = excludeIds?.filter(Boolean);

  return useInfiniteQuery({
    queryKey: ['search', 'contacts', keyword, cleanExcludeIds, conversationId],
    queryFn: ({ pageParam }) =>
      mobileApi.searchContacts(accessToken!, {
        keyword,
        cursor: pageParam,
        limit,
        excludeIds: cleanExcludeIds,
        conversationId,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
    initialPageParam: undefined as string | undefined,
    enabled: !!accessToken && keyword.length >= 3 && enabled,
    staleTime: 30_000,
  });
}
