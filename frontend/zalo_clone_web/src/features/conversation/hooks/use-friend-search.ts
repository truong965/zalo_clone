/**
 * useFriendSearch — Search hook for member selection
 *
 * Tab "Bạn bè":
 *   - No keyword → useFriendsList() (infinite query)
 *   - With keyword → useContactSearch() filtered to friends
 *
 * Tab "Tìm người lạ":
 *   - Requires phone number format
 *   - useContactSearch() filtered to non-friends
 *
 * Returns a unified list of items for the MemberList component.
 */

import { useMemo } from 'react';
import { useFriendsList } from '@/features/contacts/api/friendship.api';
import { useContactSearch } from './use-conversation-queries';
import { useCreateGroupStore } from '../stores/create-group.store';

// Phone number patterns: 0xx or +84xx (Vietnamese format)
const PHONE_REGEX = /^(0\d{2,9}|\+84\d{2,9})$/;

export interface MemberSearchItem {
      id: string;
      displayName: string;
      avatarUrl?: string;
      subtitle?: string;
      disabled: boolean;
      disabledReason?: string;
}

export type SearchTab = 'friends' | 'strangers';

export interface FriendSearchParams {
      /** Override keyword (defaults to store value) */
      keyword?: string;
      /** Override tab (defaults to store value) */
      tab?: SearchTab;
      /** User IDs to exclude from results */
      excludeIds?: string[];
}

export function useFriendSearch(params?: FriendSearchParams) {
      const storeKeyword = useCreateGroupStore((s) => s.searchKeyword);
      const storeTab = useCreateGroupStore((s) => s.searchTab);

      // Use params if provided, otherwise fallback to store
      const searchKeyword = params?.keyword ?? storeKeyword;
      const searchTab = params?.tab ?? storeTab;
      const excludeIds = params?.excludeIds ?? [];

      // ================================================================
      // Tab "Bạn bè" — default (no search) → friends list
      // ================================================================
      const friendsQuery = useFriendsList(
            searchKeyword ? { search: searchKeyword } : undefined,
      );

      // ================================================================
      // Tab "Tìm người lạ" — contact search (phone number only)
      // ================================================================
      const isValidPhone =
            searchTab === 'strangers' && PHONE_REGEX.test(searchKeyword);

      const strangerSearchQuery = useContactSearch({
            keyword: searchKeyword,
            limit: 20,
            // Only enable when tab is strangers and input looks like phone number
            // useContactSearch internally checks keyword.length >= 2
      });

      // ================================================================
      // Unified result
      // ================================================================
      const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

      const items: MemberSearchItem[] = useMemo(() => {
            if (searchTab === 'friends') {
                  // Flatten friends pages
                  const friends =
                        friendsQuery.data?.pages.flatMap((p) => p.data) ?? [];
                  return friends
                        .filter((f) => !excludeSet.has(f.userId))
                        .map((f) => ({
                              id: f.userId,
                              displayName: f.displayName,
                              avatarUrl: f.avatarUrl ?? undefined,
                              subtitle: undefined,
                              disabled: false,
                        }));
            }

            // Tab "strangers"
            if (!isValidPhone) {
                  return []; // Show empty until valid phone entered
            }

            const contacts =
                  strangerSearchQuery.data?.pages.flatMap((p) => p.data) ?? [];

            return contacts.filter((c) => !excludeSet.has(c.id)).map((c) => {
                  const isFriend = c.relationshipStatus === 'FRIEND';
                  const isBlocked = c.relationshipStatus === 'BLOCKED';
                  const canMsg = c.canMessage !== false && !isBlocked;
                  return {
                        id: c.id,
                        // Bug 7 fix: Only show alias for friends; strangers always see original name
                        displayName: isFriend
                              ? (c.displayNameFinal || c.displayName)
                              : c.displayName,
                        avatarUrl: c.avatarUrl,
                        subtitle: c.phoneNumber,
                        disabled: !canMsg,
                        disabledReason: isBlocked
                              ? 'Bạn đã chặn người dùng này'
                              : !canMsg
                                    ? 'Không thể nhắn tin cho người này'
                                    : isFriend
                                          ? 'Đã là bạn bè'
                                          : undefined,
                  };
            });
      }, [searchTab, friendsQuery.data, strangerSearchQuery.data, isValidPhone, excludeSet]);

      const isLoading =
            searchTab === 'friends'
                  ? friendsQuery.isLoading
                  : strangerSearchQuery.isLoading;

      const isFetchingNextPage =
            searchTab === 'friends'
                  ? friendsQuery.isFetchingNextPage
                  : strangerSearchQuery.isFetchingNextPage;

      const hasNextPage =
            searchTab === 'friends'
                  ? friendsQuery.hasNextPage
                  : strangerSearchQuery.hasNextPage;

      const fetchNextPage =
            searchTab === 'friends'
                  ? friendsQuery.fetchNextPage
                  : strangerSearchQuery.fetchNextPage;

      const isError =
            searchTab === 'friends'
                  ? friendsQuery.isError
                  : strangerSearchQuery.isError;

      const error =
            searchTab === 'friends'
                  ? friendsQuery.error
                  : strangerSearchQuery.error;

      const refetch =
            searchTab === 'friends'
                  ? friendsQuery.refetch
                  : strangerSearchQuery.refetch;

      const showPhoneHint =
            searchTab === 'strangers' && searchKeyword.length > 0 && !isValidPhone;

      return {
            items,
            isLoading,
            isError,
            error,
            refetch,
            isFetchingNextPage,
            hasNextPage,
            fetchNextPage,
            showPhoneHint,
      };
}
