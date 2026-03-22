export type ConversationType = 'DIRECT' | 'GROUP';

export interface MessagePreview {
  id: string;
  content: string;
  type: string;
  createdAt: string;
  senderId: string;
}

export interface ConversationMember {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface Conversation {
  id: string;
  name?: string;
  type: ConversationType;
  avatarUrl?: string;
  avatar?: string; // Backend may return 'avatar' field
  lastMessageAt: string;
  lastMessage?: MessagePreview;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  members: ConversationMember[];
  memberCount?: number;
  updatedAt: string;
  // Presence fields
  isOnline?: boolean;
  lastSeenAt?: string | null;
  otherUserId?: string | null;
  isRecentlyUpdated?: boolean;
}

export interface ConversationListResponse {
  data: Conversation[];
  meta: {
    nextCursor?: string;
    hasNextPage: boolean;
  };
}
