/**
 * Conversation Feature — API Layer
 *
 * REST API functions for conversation operations.
 * Moved from services/conversation.service.ts with TanStack Query integration.
 */

import { API_ENDPOINTS } from '@/constants/api-endpoints';
import type { ConversationUI } from '@/types/api';
import apiClient from '@/lib/axios';
import type {
      ApiResponse,
      CursorPaginatedResponse,
      Conversation,
      ConversationListItem,
      PinnedMessageItem,
} from '@/types/api';
import type { GroupListItem, ContactSearchResult, ContactSearchParams } from '../types';

// ============================================================================
// HELPERS
// ============================================================================

function formatTimestamp(isoDate: string): string {
      const date = new Date(isoDate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Vừa xong';
      if (diffMins < 60) return `${diffMins} phút`;
      if (diffMins < 1440) return `${Math.floor(diffMins / 60)} giờ`;
      return date.toLocaleDateString('vi-VN');
}

/**
 * Resolve avatar URL with appropriate fallback.
 * - DM conversations: pravatar.cc placeholder seeded by conversation id
 * - Group conversations: no external fallback (let UI show group icon)
 */
function resolveAvatar(
      url: string | null | undefined,
      id: string,
      type?: 'DM' | 'GROUP',
): string | undefined {
      if (url) return url;
      if (type === 'GROUP') return undefined; // Let component render default group icon
      return `https://i.pravatar.cc/150?u=${id}`;
}

function mapConversationToUI(conv: Conversation): ConversationUI {
      return {
            ...conv,
            avatar: resolveAvatar(conv.avatarUrl, conv.id, conv.type as 'DM' | 'GROUP'),
            lastMessage: 'Loading...',
            timestamp: conv.lastMessageAt
                  ? formatTimestamp(conv.lastMessageAt)
                  : 'Vừa xong',
            unread: 0,
            isOnline: false,
            isPinned: false,
      };
}

function mapConversationListItemToUI(item: ConversationListItem): ConversationUI {
      const lastMessagePreview = item.lastMessage?.content ?? '';
      const timestamp = item.updatedAt ? formatTimestamp(item.updatedAt) : undefined;

      return {
            id: item.id,
            type: item.type,
            name: item.name ?? undefined,
            avatar: resolveAvatar(item.avatar, item.id, item.type as 'DM' | 'GROUP'),
            isOnline: item.isOnline,
            lastSeenAt: item.lastSeenAt,
            isBlocked: item.isBlocked,
            otherUserId: item.otherUserId ?? null,
            updatedAt: item.updatedAt,
            lastMessageAt: item.lastMessageAt ?? undefined,
            lastMessageObj: item.lastMessage,
            lastMessage: lastMessagePreview,
            timestamp,
            unreadCount: item.unreadCount ?? 0,
            unread: item.unreadCount ?? 0,
            lastReadMessageId: item.lastReadMessageId ?? null,
            // E.3: Enriched fields from backend
            myRole: item.myRole as 'ADMIN' | 'MEMBER' | undefined,
            requireApproval: item.requireApproval,
            isMuted: item.isMuted,
            isPinned: item.isPinned ?? false,
            pinnedAt: item.pinnedAt ?? null,
      };
}

// ============================================================================
// MEMBER INFO TYPE (kept here for backward compat)
// ============================================================================

export interface ConversationMemberInfo {
      id: string;
      displayName: string;
      avatarUrl: string | null;
      role: 'ADMIN' | 'MEMBER';
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function getConversations(params?: {
      cursor?: string;
      limit?: number;
}): Promise<CursorPaginatedResponse<ConversationUI>> {
      const response = await apiClient.get<ApiResponse<CursorPaginatedResponse<ConversationListItem>>>(
            API_ENDPOINTS.CONVERSATIONS.GET_ALL,
            { params },
      );
      const result = response.data.data;
      return {
            data: result.data.map(mapConversationListItemToUI),
            meta: result.meta,
      };
}

async function getOrCreateDirectConversation(recipientId: string): Promise<ConversationUI> {
      const response = await apiClient.post<ApiResponse<Conversation>>(
            API_ENDPOINTS.CONVERSATIONS.CREATE,
            { recipientId },
      );
      return mapConversationToUI(response.data.data);
}

async function getConversationById(conversationId: string): Promise<ConversationUI> {
      const response = await apiClient.get<ApiResponse<ConversationListItem>>(
            API_ENDPOINTS.CONVERSATIONS.GET_BY_ID(conversationId),
      );
      return mapConversationListItemToUI(response.data.data);
}

async function getConversationMembers(conversationId: string): Promise<ConversationMemberInfo[]> {
      const response = await apiClient.get<ApiResponse<ConversationMemberInfo[]>>(
            API_ENDPOINTS.CONVERSATIONS.GET_MEMBERS(conversationId),
      );
      return response.data.data;
}

async function getUserGroups(params?: {
      cursor?: string;
      limit?: number;
      search?: string;
}): Promise<CursorPaginatedResponse<GroupListItem>> {
      const response = await apiClient.get<ApiResponse<CursorPaginatedResponse<GroupListItem>>>(
            API_ENDPOINTS.CONVERSATIONS.GROUPS,
            { params },
      );
      return response.data.data;
}

async function searchContacts(
      params: ContactSearchParams,
): Promise<CursorPaginatedResponse<ContactSearchResult>> {
      const response = await apiClient.get<ApiResponse<CursorPaginatedResponse<ContactSearchResult>>>(
            API_ENDPOINTS.SEARCH.CONTACTS,
            { params },
      );
      return response.data.data;
}

async function pinConversation(
      conversationId: string,
): Promise<{ isPinned: boolean; pinnedAt: string }> {
      const response = await apiClient.post<ApiResponse<{ isPinned: boolean; pinnedAt: string }>>(
            API_ENDPOINTS.CONVERSATIONS.PIN(conversationId),
      );
      return response.data.data;
}

async function unpinConversation(
      conversationId: string,
): Promise<{ isPinned: boolean }> {
      const response = await apiClient.delete<ApiResponse<{ isPinned: boolean }>>(
            API_ENDPOINTS.CONVERSATIONS.PIN(conversationId),
      );
      return response.data.data;
}

// ── Pin Message (Phase 3) ────────────────────────────────────────────────

async function getPinnedMessages(
      conversationId: string,
): Promise<PinnedMessageItem[]> {
      const response = await apiClient.get<ApiResponse<PinnedMessageItem[]>>(
            API_ENDPOINTS.CONVERSATIONS.PINNED_MESSAGES(conversationId),
      );
      return response.data.data;
}

async function pinMessage(
      conversationId: string,
      messageId: string,
): Promise<{ success: boolean }> {
      const response = await apiClient.post<ApiResponse<{ success: boolean }>>(
            API_ENDPOINTS.CONVERSATIONS.PIN_MESSAGE(conversationId),
            { messageId },
      );
      return response.data.data;
}

async function unpinMessage(
      conversationId: string,
      messageId: string,
): Promise<{ success: boolean }> {
      const response = await apiClient.delete<ApiResponse<{ success: boolean }>>(
            API_ENDPOINTS.CONVERSATIONS.PIN_MESSAGE(conversationId),
            { data: { messageId } },
      );
      return response.data.data;
}

// ============================================================================
// EXPORTS
// ============================================================================

/** Main API object — used by TanStack Query hooks */
export const conversationApi = {
      getConversations,
      getOrCreateDirectConversation,
      getConversationById,
      getConversationMembers,
      getUserGroups,
      searchContacts,
      pinConversation,
      unpinConversation,
      getPinnedMessages,
      pinMessage,
      unpinMessage,
};

/**
 * @deprecated Use `conversationApi` from `@/features/conversation` instead.
 * Kept for backward compatibility with existing imports.
 */
export const conversationService = conversationApi;

// Re-export mapper functions for use in realtime hooks
export { mapConversationListItemToUI, mapConversationToUI, formatTimestamp };
