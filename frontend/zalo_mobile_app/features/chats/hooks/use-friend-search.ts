import { useMemo } from 'react';
import { Friend } from '@/types/friendship';
import { useFriendsList, useContactSearch } from './use-conversation-queries';

export interface MemberSearchItem {
  id: string;
  displayName: string;
  avatarUrl?: string;
  subtitle?: string;
  disabled: boolean;
  disabledReason?: string;
}

export type SearchTab = 'friends' | 'strangers';

const PHONE_REGEX = /^(0|\+84)\d{9}$/;

export interface FriendSearchParams {
  keyword: string;
  tab: SearchTab;
  excludeIds?: string[];
  conversationId?: string;
  enabled?: boolean;
}

/**
 * Hook to handle friend and stranger search for the AddMembersModal.
 * The keyword is expected to be debounced by the caller.
 */
export function useFriendSearch({ 
  keyword, 
  tab, 
  excludeIds = [], 
  conversationId, 
  enabled = true 
}: FriendSearchParams) {
  
  // Tab "Bạn bè"
  const friendsQuery = useFriendsList({
    search: keyword || undefined,
    enabled: enabled && tab === 'friends',
    excludeIds,
    conversationId,
  });

  // Tab "Người lạ"
  const isValidPhone = tab === 'strangers' && PHONE_REGEX.test(keyword);
  const strangerSearchQuery = useContactSearch({
    keyword,
    limit: 20,
    excludeIds,
    conversationId,
    enabled: enabled && tab === 'strangers' && isValidPhone
  });

  const items: MemberSearchItem[] = useMemo(() => {
    if (tab === 'friends') {
      const allFriends = (friendsQuery.data?.pages.flatMap((p) => p.data) ?? []) as Friend[];
      return allFriends
        .filter((f) => f && f.userId)
        .map((f) => ({
          id: f.userId,
          displayName: f.resolvedDisplayName || f.displayName || 'Unknown',
          avatarUrl: f.avatarUrl,
          disabled: false,
        }));
    }

    // Tab "strangers"
    if (!isValidPhone) return [];

    const contacts = (strangerSearchQuery.data?.pages.flatMap((p) => p.data) ?? []) as any[];
    return contacts
      .filter((c) => c && c.id)
      .map((c) => {
        const isBlocked = c.relationshipStatus === 'BLOCKED';
        const canMsg = c.canMessage !== false && !isBlocked;

        return {
          id: c.id,
          displayName: c.displayName || 'Unknown',
          avatarUrl: c.avatarUrl,
          subtitle: c.phoneNumber,
          disabled: !canMsg,
          disabledReason: isBlocked
            ? 'Bạn đã chặn người dùng này'
            : !canMsg
              ? 'Không thể nhắn tin cho người này'
              : undefined,
        };
      });
  }, [tab, friendsQuery.data, strangerSearchQuery.data, isValidPhone]);

  return {
    items,
    isLoading: tab === 'friends' ? friendsQuery.isLoading : (isValidPhone && strangerSearchQuery.isLoading),
    hasNextPage: tab === 'friends' ? friendsQuery.hasNextPage : strangerSearchQuery.hasNextPage,
    fetchNextPage: tab === 'friends' ? friendsQuery.fetchNextPage : strangerSearchQuery.fetchNextPage,
    isFetchingNextPage: tab === 'friends' ? friendsQuery.isFetchingNextPage : strangerSearchQuery.isFetchingNextPage,
    showPhoneHint: tab === 'strangers' && keyword.length > 0 && !isValidPhone,
  };
}
