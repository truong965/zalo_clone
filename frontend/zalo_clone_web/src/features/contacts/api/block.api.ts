/**
 * Block Feature — API Layer
 *
 * REST API functions for block/unblock operations.
 * Follows the same pattern as conversation.api.ts.
 */

import { API_ENDPOINTS } from '@/constants/api-endpoints';
import apiClient from '@/lib/axios';
import type {
      ApiResponse,
      Block,
      BlockedUserItem,
      CursorPaginatedResponse,
} from '@/types/api';

// ============================================================================
// API Functions
// ============================================================================

/**
 * Block a user. Idempotent — if already blocked, returns existing block.
 */
async function blockUser(targetUserId: string, reason?: string): Promise<Block> {
      const response = await apiClient.post<ApiResponse<Block>>(
            API_ENDPOINTS.BLOCK.BLOCK_USER,
            { targetUserId, reason },
      );
      return response.data.data;
}

/**
 * Unblock a user. Idempotent — if not blocked, succeeds silently.
 */
async function unblockUser(targetUserId: string): Promise<void> {
      await apiClient.delete(API_ENDPOINTS.BLOCK.UNBLOCK_USER(targetUserId));
}

/**
 * Get paginated list of users blocked by the current user.
 */
async function getBlockedList(params?: {
      cursor?: string;
      limit?: number;
      search?: string;
}): Promise<CursorPaginatedResponse<BlockedUserItem>> {
      const response = await apiClient.get<ApiResponse<CursorPaginatedResponse<BlockedUserItem>>>(
            API_ENDPOINTS.BLOCK.GET_BLOCKED_LIST,
            { params: { cursor: params?.cursor, limit: params?.limit ?? 20, search: params?.search } },
      );
      return response.data.data;
}

export const blockApi = {
      blockUser,
      unblockUser,
      getBlockedList,
};
