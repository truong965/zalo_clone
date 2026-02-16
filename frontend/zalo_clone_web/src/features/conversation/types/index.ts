/**
 * Conversation Feature Types
 *
 * Group-specific types for the conversation feature module.
 * Reuses shared API types from @/types/api where possible.
 */

import type { ConversationLastMessage } from '@/types/api';

// ============================================================================
// GROUP LIST TYPES
// ============================================================================

/** Group conversation list item — matches backend GroupListItemDto */
export interface GroupListItem {
      id: string;
      name: string | null;
      avatarUrl: string | null;
      memberCount: number;
      membersPreview: string[];
      lastMessageAt: string | null;
      lastMessage: ConversationLastMessage | null;
      unreadCount: number;
      myRole: string;            // 'ADMIN' | 'MEMBER'
      isMuted: boolean;
      requireApproval: boolean;
      createdAt: string;
      updatedAt: string;
}

// ============================================================================
// CONTACT SEARCH TYPES (for create group modal)
// ============================================================================

/** Contact search result — matches backend ContactSearchResultDto */
export interface ContactSearchResult {
      id: string;
      phoneNumber?: string;
      displayName: string;
      displayNameFinal: string;
      avatarUrl?: string;
      relationshipStatus: 'FRIEND' | 'REQUEST' | 'NONE' | 'BLOCKED';
      requestDirection?: 'OUTGOING' | 'INCOMING';
      pendingRequestId?: string;
      hasAlias: boolean;
      aliasPriority: number;
      canMessage?: boolean;
      lastSeenAt?: string;
      isOnline?: boolean;
      isPrivacyLimited?: boolean;
      existingConversationId?: string;
}

/** Params for contact search API */
export interface ContactSearchParams {
      keyword: string;
      cursor?: string;
      limit?: number;
      excludeIds?: string[];
      hasAlias?: boolean;
}
