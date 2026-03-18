import { InfiniteData, useInfiniteQuery, UseInfiniteQueryOptions } from '@tanstack/react-query';

interface CursorPaginationMeta {
  nextCursor?: string;
  hasNextPage: boolean;
}

interface CursorPaginationResponse<T> {
  data: T[];
  meta: CursorPaginationMeta;
}

export function useCursorPagination<T>(
  queryKey: readonly unknown[],
  queryFn: (cursor?: string) => Promise<CursorPaginationResponse<T>>,
  options?: Omit<
    UseInfiniteQueryOptions<
      CursorPaginationResponse<T>,
      Error,
      InfiniteData<CursorPaginationResponse<T>, string | undefined>,
      readonly unknown[],
      string | undefined
    >,
    'queryKey' | 'queryFn' | 'getNextPageParam' | 'initialPageParam'
  >
) {
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => queryFn(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined),
    ...options,
  });
}
