/**
 * Conversation Module Types
 *
 * Conversation entities, group membership, and the canonical ConversationUI
 * type shared between the conversation and chat features.
 *
 * ConversationUI was previously located at:
 *   features/conversation/types/conversation.ts
 * Moving it here breaks the circular dependency:
 *   conversation/types → @/features/chat/types → conversation/types
 */

import type { MessageType } from './messaging.types';

// ============================================================================
// ENUMS
// ============================================================================

export const ConversationType = {
      DIRECT: 'DIRECT',
      GROUP: 'GROUP',
} as const;

export type ConversationType =
      (typeof ConversationType)[keyof typeof ConversationType];

export const MemberRole = {
      ADMIN: 'ADMIN',
      MEMBER: 'MEMBER',
} as const;

export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];

export const MemberStatus = {
      PENDING: 'PENDING',
      ACTIVE: 'ACTIVE',
      KICKED: 'KICKED',
      LEFT: 'LEFT',
} as const;

export type MemberStatus =
      (typeof MemberStatus)[keyof typeof MemberStatus];

export const JoinRequestStatus = {
      PENDING: 'PENDING',
      APPROVED: 'APPROVED',
      REJECTED: 'REJECTED',
} as const;

export type JoinRequestStatus =
      (typeof JoinRequestStatus)[keyof typeof JoinRequestStatus];

// ============================================================================
// ENTITIES
// ============================================================================

export interface Conversation {
      id: string;
      type: ConversationType;
      name?: string;
      avatarUrl?: string;
      lastMessageAt?: string;
      createdAt?: string;
      updatedAt?: string;
}

export interface ConversationLastMessage {
      id: string;
      content: string | null;
      type: MessageType;
      senderId: string | null;
      createdAt: string;
}

export interface ConversationListItem {
      id: string;
      type: ConversationType;
      name: string | null;
      avatar: string | null;
      isOnline: boolean;
      isBlocked: boolean;
      otherUserId?: string | null;
      lastSeenAt: string | null;
      lastMessageAt: string | null;
      lastMessage: ConversationLastMessage | null;
      updatedAt: string;
      unreadCount?: number;
      lastReadMessageId?: string | null;
      /** Current user's role in this conversation (enriched by backend) */
      myRole?: MemberRole;
      /** Whether this group requires admin approval to join */
      requireApproval?: boolean;
      /** Whether current user has muted this conversation */
      isMuted?: boolean;
}

export interface ConversationMember {
      conversationId: string;
      userId: string;
      role: MemberRole;
      status: MemberStatus;
      promotedBy?: string;
      promotedAt?: string;
      demotedBy?: string;
      demotedAt?: string;
      lastReadMessageId?: string;
      lastReadAt?: string;
      unreadCount: number;
      joinedAt: string;
      leftAt?: string;
      kickedBy?: string;
      kickedAt?: string;
}

export interface GroupJoinRequest {
      id: string;
      conversationId: string;
      userId: string;
      status: JoinRequestStatus;
      inviterId?: string;
      requestedAt: string;
      expiresAt?: string;
      message?: string;
      reviewedBy?: string;
      reviewedAt?: string;
}

// ============================================================================
// UI TYPES
// ============================================================================

/**
 * Canonical UI representation of a conversation.
 *
 * Extends the API Conversation entity with fields required for list rendering
 * (last message preview, online status, unread badge, etc.).
 *
 * Previously located at features/conversation/types/conversation.ts — moved
 * here to serve as the single source of truth shared between the conversation
 * and chat features without creating a circular dependency.
 */
export interface ConversationUI extends Conversation {
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
