/**
 * Types cho Contacts module
 */

import type { User, Friend, Block } from '@/types';

export type { User, Friend, Block };

export interface ContactsState {
  contacts: User[];
  friends: Friend[];
  blockedUsers: Block[];
  isLoading: boolean;
  error: string | null;
  searchResults: User[];
}

export interface FriendRequest {
  userId: string;
}

export interface SendFriendRequestRequest {
  friendId: string;
}
