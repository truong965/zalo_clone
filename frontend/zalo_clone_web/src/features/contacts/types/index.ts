/**
 * Types cho Contacts module
 */

import type { User, Block, FriendshipStatus, CursorPaginatedResponse } from '@/types';

export type { User, Block, FriendshipStatus, CursorPaginatedResponse };

export interface ContactsState {
  contacts: User[];
  friends: FriendWithUserDto[];
  blockedUsers: Block[];
  isLoading: boolean;
  error: string | null;
  searchResults: User[];
}

// --- Friend Request types ---

export interface FriendRequestUser {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

/** Response from GET /friend-requests/received and /sent */
export interface FriendRequestWithUserDto {
  id: string;
  status: FriendshipStatus;
  createdAt: string;
  expiresAt?: string;
  requester: FriendRequestUser;
  target: FriendRequestUser;
}

/** Response from GET /friendships (list) */
export interface FriendWithUserDto {
  friendshipId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  status: FriendshipStatus;
  createdAt: string;
  acceptedAt?: string;
}

export interface MutualFriendDto {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

/** Send friend request body */
export interface SendFriendRequestBody {
  targetUserId: string;
}

/** Socket event payloads */
export interface FriendshipSocketPayload {
  friendshipId: string;
  fromUserId: string;
  toUserId: string;
  requester?: FriendRequestUser;
  target?: FriendRequestUser;
}
