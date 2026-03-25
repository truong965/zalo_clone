import { UserProfile } from './auth';

export interface FriendRequest {
  id: string;
  requesterId: string;
  user1Id: string;
  user2Id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  requester?: {
    userId: string;
    displayName: string;
    avatarUrl?: string;
  };
  target?: {
    userId: string;
    displayName: string;
    avatarUrl?: string;
  };
}

export interface Friend {
  friendshipId: string;
  userId: string;
  /** Raw display name from User table */
  displayName: string;
  /** Resolved name: aliasName > phoneBookName > displayName */
  resolvedDisplayName: string;
  /** User-set alias from UserContact (if exists) */
  aliasName?: string;
  /** Phone-book name from sync (if exists) */
  phoneBookName?: string;
  /** Whether this friend is also in the owner's phone-book contacts */
  isContact: boolean;
  avatarUrl?: string;
  status: 'ACCEPTED' | 'PENDING' | 'DECLINED' | 'CANCELLED';
  createdAt: string;
  acceptedAt?: string;
}
