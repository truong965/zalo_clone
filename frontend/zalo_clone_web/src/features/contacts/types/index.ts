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

// --- Friend Request types ---

export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';

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

/** Cursor-paginated response wrapper — matches backend CursorPaginationHelper.buildResult() */
export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: {
    nextCursor?: string;
    hasNextPage: boolean;
    limit: number;
    total?: number;
  };
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
