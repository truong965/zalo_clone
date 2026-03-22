import { UserProfile } from './auth';

export interface FriendRequest {
  id: string;
  senderId: string;
  targetUserId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  sender?: UserProfile;
  target?: UserProfile;
}

export interface Friend {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  user: UserProfile;
}
