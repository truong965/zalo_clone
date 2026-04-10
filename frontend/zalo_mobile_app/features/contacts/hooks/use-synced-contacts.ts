import { useInfiniteQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';

export const contactKeys = {
  all: ['contacts'] as const,
  synced: (params?: { search?: string; excludeFriends?: boolean }) => 
    [...contactKeys.all, 'synced', params] as const,
};

export function useSyncedContacts(params: { search?: string; limit?: number; excludeFriends?: boolean } = {}) {
  const { accessToken } = useAuth();
  const limit = params.limit ?? 20;

  return useInfiniteQuery({
    queryKey: contactKeys.synced({ search: params.search, excludeFriends: params.excludeFriends }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      if (!accessToken) throw new Error('No access token');
      return mobileApi.getSyncedContacts(accessToken, {
        cursor: pageParam,
        limit,
        search: params.search,
        excludeFriends: params.excludeFriends,
      });
    },
    getNextPageParam: (lastPage) => 
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
    enabled: !!accessToken,
    staleTime: 60 * 1000, // 1 minute
  });
}
