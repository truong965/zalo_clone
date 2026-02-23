/**
 * Contacts Feature — Update Alias Hook
 *
 * Mutation to set or clear the alias name for a phone-book contact.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notification } from 'antd';
import { contactsApi } from '../api/contacts.api';
import { contactKeys } from './use-contact-check';
import { handleInteractionError } from '@/utils/interaction-error';
import { friendshipKeys } from '../api/friendship.api';

// ============================================================================
// Hook
// ============================================================================

/**
 * Mutation to update (or clear) the alias for a contact.
 *
 * On success:
 *  - Invalidates `contactKeys.check(contactUserId)` so ChatHeader re-fetches.
 *  - Invalidates `contactKeys.list()` so contact list reflects the new name.
 *  - Invalidates `friendshipKeys.friendsList()` in case the contact is also a friend.
 */
export function useUpdateAlias() {
      const queryClient = useQueryClient();

      return useMutation({
            mutationFn: ({
                  contactUserId,
                  aliasName,
            }: {
                  contactUserId: string;
                  aliasName: string | null;
            }) => contactsApi.updateAlias(contactUserId, { aliasName }),

            onSuccess: (_data, variables) => {
                  void queryClient.invalidateQueries({
                        queryKey: contactKeys.check(variables.contactUserId),
                  });
                  void queryClient.invalidateQueries({
                        queryKey: contactKeys.list(),
                  });
                  void queryClient.invalidateQueries({
                        queryKey: friendshipKeys.friendsList(),
                  });
                  // GAP-3: Invalidate conversation list + loaded message pages
                  // so resolved display names refresh after alias change
                  void queryClient.invalidateQueries({ queryKey: ['conversations'] });
                  void queryClient.invalidateQueries({ queryKey: ['messages'] });

                  notification.success({
                        message: variables.aliasName
                              ? 'Đã cập nhật biệt danh'
                              : 'Đã xoá biệt danh',
                  });
            },

            onError: (error) => {
                  handleInteractionError(error);
            },
      });
}
