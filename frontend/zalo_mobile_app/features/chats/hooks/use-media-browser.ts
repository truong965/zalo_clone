import { useInfiniteQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';

export type MessageType = 'IMAGE' | 'VIDEO' | 'FILE' | 'AUDIO' | 'STICKER' | 'SYSTEM' | 'TEXT' | 'VOICE';

export function useMediaBrowser(
  conversationId: string | undefined,
  types: string[],
  keyword?: string,
) {
  const { accessToken } = useAuth();

  return useInfiniteQuery({
    queryKey: ['media-browser', conversationId, types.join(','), keyword ?? ''],
    queryFn: ({ pageParam }) =>
      mobileApi.getRecentMedia(conversationId!, accessToken!, {
        limit: 30,
        types: types.join(','),
        cursor: pageParam,
        keyword: keyword?.trim(),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
    enabled: !!conversationId && !!accessToken,
    staleTime: 60_000,
  });
}
