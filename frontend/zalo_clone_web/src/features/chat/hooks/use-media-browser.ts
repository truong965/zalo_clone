/**
 * useMediaBrowser — Paginated media browsing for a conversation.
 *
 * Used by MediaBrowserPanel to browse all media (images, videos, files)
 * with cursor-based pagination and optional keyword filter (for files).
 *
 * Uses TanStack Query useInfiniteQuery for automatic page management.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/constants/api-endpoints';
import type { RecentMediaItem, MessageType } from '@/types/api';

// ============================================================================
// TYPES
// ============================================================================

interface MediaBrowserPage {
  items: RecentMediaItem[];
  meta: {
    limit: number;
    hasNextPage: boolean;
    nextCursor?: string;
  };
}

// ============================================================================
// QUERY KEY FACTORY
// ============================================================================

export const MEDIA_BROWSER_QUERY_KEY = 'media-browser' as const;

function buildQueryKey(
  conversationId: string,
  types: MessageType[],
  limit: number,
  keyword?: string,
) {
  return [MEDIA_BROWSER_QUERY_KEY, conversationId, types.join(','), limit, keyword ?? ''] as const;
}

// ============================================================================
// API FUNCTION
// ============================================================================

async function fetchMediaPage(
  conversationId: string,
  types: MessageType[],
  limit: number,
  cursor?: string,
  keyword?: string,
): Promise<MediaBrowserPage> {
  const params: Record<string, string | number> = {
    types: types.join(','),
    limit,
  };
  if (cursor) params.cursor = cursor;
  if (keyword?.trim()) params.keyword = keyword.trim();

  // response.data = TransformInterceptor wrapper { statusCode, message, data }
  // response.data.data = service return { items, meta }
  const response = await apiClient.get<{ data: MediaBrowserPage }>(
    API_ENDPOINTS.MESSAGES.RECENT_MEDIA(conversationId),
    { params },
  );

  return response.data.data;
}

// ============================================================================
// HOOK
// ============================================================================

const PAGE_SIZE = 30;

/**
 * Browse media in a conversation with infinite scroll pagination.
 *
 * @param conversationId  Target conversation
 * @param types           MessageType values to include, e.g. ['IMAGE','VIDEO'] or ['FILE']
 * @param keyword         Optional filename keyword filter (for FILE tab)
 *
 * @example
 * ```tsx
 * const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
 *   useMediaBrowser(conversationId, ['IMAGE', 'VIDEO']);
 * const allItems = data?.pages.flatMap(p => p.data) ?? [];
 * ```
 */
export function useMediaBrowser(
  conversationId: string | undefined,
  types: MessageType[],
  keyword?: string,
) {
  return useInfiniteQuery({
    queryKey: buildQueryKey(conversationId ?? '', types, PAGE_SIZE, keyword),
    queryFn: ({ pageParam }) =>
      fetchMediaPage(conversationId!, types, PAGE_SIZE, pageParam, keyword),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
    enabled: !!conversationId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
