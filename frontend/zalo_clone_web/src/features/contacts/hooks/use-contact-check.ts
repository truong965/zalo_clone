/**
 * Contacts Feature — Contact Check Hook
 *
 * Checks if a given user is in the current user's contact list.
 */

import { useQuery } from '@tanstack/react-query';
import { contactsApi } from '../api/contacts.api';

// ============================================================================
// Query Keys
// ============================================================================

export const contactKeys = {
      all: ['contacts'] as const,
      list: (params?: { search?: string; limit?: number; excludeFriends?: boolean }) =>
            [...contactKeys.all, 'list', params] as const,
      check: (targetUserId: string) =>
            [...contactKeys.all, 'check', targetUserId] as const,
} as const;

// ============================================================================
// Hook
// ============================================================================

/**
 * Query whether `targetUserId` is in the current user's contact list.
 *
 * - Disabled when `targetUserId` is falsy.
 * - 60 s staleTime: contact relationships rarely change mid-session.
 */
export function useContactCheck(targetUserId: string | null | undefined) {
      return useQuery({
            queryKey: contactKeys.check(targetUserId ?? ''),
            queryFn: () => contactsApi.checkIsContact(targetUserId!),
            enabled: !!targetUserId,
            staleTime: 60_000,
      });
}
