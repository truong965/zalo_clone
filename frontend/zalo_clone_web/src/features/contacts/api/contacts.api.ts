/**
 * Contacts Feature — API Layer
 *
 * REST functions for phone-book contact management (separate from friendships).
 * No TanStack imports — hooks live in hooks/use-contact-*.ts.
 */

import { API_ENDPOINTS } from '@/constants/api-endpoints';
import apiClient from '@/lib/axios';
import type { ApiResponse, CursorPaginatedResponse } from '@/types/api';
import type {
      ContactCheckResult,
      ContactResponseDto,
      UpdateAliasBody,
} from '../types/contact.types';

// ============================================================================
// API Functions
// ============================================================================

/**
 * Check whether a user is in the current user's contact list.
 * Returns aliasName / phoneBookName / source even when isFriend is true.
 */
async function checkIsContact(targetUserId: string): Promise<ContactCheckResult> {
      const response = await apiClient.get<ApiResponse<ContactCheckResult>>(
            API_ENDPOINTS.CONTACTS.CHECK(targetUserId),
      );
      return response.data.data;
}

/**
 * Paginated list of phone-book contacts for the current user.
 */
async function getContacts(params?: {
      cursor?: string;
      limit?: number;
      search?: string;
      excludeFriends?: boolean;
}): Promise<CursorPaginatedResponse<ContactResponseDto>> {
      const response = await apiClient.get<
            ApiResponse<CursorPaginatedResponse<ContactResponseDto>>
      >(API_ENDPOINTS.CONTACTS.GET_ALL, {
            params: {
                  cursor: params?.cursor,
                  limit: params?.limit ?? 20,
                  search: params?.search,
                  excludeFriends: params?.excludeFriends,
            },
      });
      return response.data.data;
}

/**
 * Set or clear the alias name for a contact.
 * Pass `aliasName: null` to reset to default.
 */
async function updateAlias(
      contactUserId: string,
      body: UpdateAliasBody,
): Promise<ContactResponseDto> {
      const response = await apiClient.patch<ApiResponse<ContactResponseDto>>(
            API_ENDPOINTS.CONTACTS.UPDATE_ALIAS(contactUserId),
            body,
      );
      return response.data.data;
}

/**
 * Remove a contact entry (does not affect friendship).
 */
async function removeContact(contactUserId: string): Promise<void> {
      await apiClient.delete(API_ENDPOINTS.CONTACTS.REMOVE(contactUserId));
}

// ============================================================================
// Exported API Object
// ============================================================================

export const contactsApi = {
      checkIsContact,
      getContacts,
      updateAlias,
      removeContact,
};
