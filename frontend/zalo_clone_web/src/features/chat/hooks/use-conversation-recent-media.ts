/**
 * useConversationRecentMedia — Fetch the N most recent media items
 * (images, videos, files, etc.) for a given conversation.
 *
 * Used by the info sidebar (DirectInfoContent / GroupInfoContent) to show
 * a quick media preview grid with a "Xem tất cả" button.
 *
 * Rules applied:
 * - client-swr-dedup: TanStack Query deduplicates identical requests automatically.
 * - rerender-derived-state: consumers subscribe only to the data they need.
 * - async-parallel: two calls with different `types` run in parallel (React concurrent).
 */

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/constants/api-endpoints';
import type { RecentMediaItem, MessageType } from '@/types/api';

// ============================================================================
// QUERY KEY FACTORY
// ============================================================================

export const RECENT_MEDIA_QUERY_KEY = 'conversation-recent-media' as const;

/**
 * Stable query key builder.
 * Includes conversationId + types + limit so different filter combos are cached independently.
 */
function buildQueryKey(
  conversationId: string,
  types: MessageType[],
  limit: number,
) {
  return [RECENT_MEDIA_QUERY_KEY, conversationId, types.join(','), limit] as const;
}

// ============================================================================
// API FUNCTION
// ============================================================================

async function fetchRecentMedia(
  conversationId: string,
  types: MessageType[],
  limit: number,
): Promise<RecentMediaItem[]> {
  const response = await apiClient.get<{ data: { items: RecentMediaItem[] } }>(
    API_ENDPOINTS.MESSAGES.RECENT_MEDIA(conversationId),
    {
      params: {
        types: types.join(','),
        limit,
      },
    },
  );

  // response.data = TransformInterceptor wrapper { statusCode, message, data }
  // response.data.data = service return { items, meta }
  return response.data.data.items;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Fetch the most recent media for a conversation.
 *
 * @param conversationId  Target conversation (undefined → query disabled)
 * @param types           MessageType values to include, e.g. ['IMAGE','VIDEO'] or ['FILE']
 * @param limit           Number of items (default 3)
 *
 * @example
 * ```tsx
 * const { data: recentPhotos } = useConversationRecentMedia(id, ['IMAGE', 'VIDEO'], 3);
 * const { data: recentFiles }  = useConversationRecentMedia(id, ['FILE'], 3);
 * ```
 */
export function useConversationRecentMedia(
  conversationId: string | undefined,
  types: MessageType[],
  limit = 3,
) {
  return useQuery({
    queryKey: buildQueryKey(conversationId ?? '', types, limit),
    queryFn: () => fetchRecentMedia(conversationId!, types, limit),
    enabled: !!conversationId,
    staleTime: 60_000, // 1 min — media list updates infrequently
    gcTime: 5 * 60_000, // 5 min garbage collection
  });
}
