/**
 * Conversation UI types shared across conversation/chat features.
 * Decouples chat types from conversation APIs (D3).
 */

import type {
      Conversation as ApiConversation,
      ConversationLastMessage,
      ConversationListItem,
} from '@/types/api';

export interface ConversationUI extends ApiConversation {
      avatar?: string;
      lastMessage?: string;
      timestamp?: string;
      unread?: number;
      isOnline?: boolean;
      lastSeenAt?: string | null;
      isPinned?: boolean;
      updatedAt?: string;
      lastMessageObj?: ConversationLastMessage | null;
      unreadCount?: number;
      lastReadMessageId?: string | null;
      isBlocked?: boolean;
      otherUserId?: string | null;
      /** Current user's role in this conversation */
      myRole?: 'ADMIN' | 'MEMBER';
      /** Whether this group requires admin approval to join */
      requireApproval?: boolean;
      /** Whether current user has muted this conversation */
      isMuted?: boolean;
}

export type ConversationListItemUI = Omit<ConversationListItem, 'unreadCount'> & {
      unreadCount?: number;
};
