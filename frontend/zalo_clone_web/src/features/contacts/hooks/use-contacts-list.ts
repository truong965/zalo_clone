/**
 * Contacts Feature — Contacts List Hook + Remove Contact Mutation
 *
 * Infinite query for the current user's phone-book contacts,
 * plus a mutation for removing a contact entry.
 */

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notification } from 'antd';
import { contactsApi } from '../api/contacts.api';
import { contactKeys } from './use-contact-check';
import { handleInteractionError } from '@/utils/interaction-error';

// ============================================================================
// Contacts List Hook
// ============================================================================

/**
 * Infinite query for the paginated contacts list.
 * 30 s staleTime: contacts rarely change within a short session window.
 */
export function useContactsList(params?: { search?: string; limit?: number; excludeFriends?: boolean }) {
      const limit = params?.limit ?? 20;

      return useInfiniteQuery({
            queryKey: contactKeys.list({ search: params?.search, limit, excludeFriends: params?.excludeFriends }),
            initialPageParam: undefined as string | undefined,
            queryFn: ({ pageParam }) =>
                  contactsApi.getContacts({
                        cursor: pageParam,
                        limit,
                        search: params?.search,
                        excludeFriends: params?.excludeFriends,
                  }),
            getNextPageParam: (lastPage) =>
                  lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
            staleTime: 30_000,
      });
}

// ============================================================================
// Remove Contact Hook
// ============================================================================

/**
 * Mutation to remove a contact entry (does not affect the friendship).
 * On success: invalidates contacts list + contact check for that user.
 */
export function useRemoveContact() {
      const queryClient = useQueryClient();

      return useMutation({
            mutationFn: (contactUserId: string) =>
                  contactsApi.removeContact(contactUserId),

            onSuccess: (_data, contactUserId) => {
                  // Use prefix key ['contacts', 'list'] to match all list variants
                  void queryClient.invalidateQueries({ queryKey: ['contacts', 'list'] });
                  void queryClient.invalidateQueries({ queryKey: contactKeys.check(contactUserId) });
                  notification.success({ message: 'Đã xoá khỏi danh bạ' });
            },

            onError: (error) => {
                  handleInteractionError(error);
            },
      });
}
