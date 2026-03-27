/**
 * Block Feature Types
 * Mirrors backend BlockedUserDto and CursorPaginatedResult
 */

export interface BlockedUser {
  blockId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  blockedAt: string;
  reason?: string;
}

export interface BlockedListResponse {
  data: BlockedUser[];
  meta: {
    limit: number;
    hasNextPage: boolean;
    nextCursor?: string;
  };
}
