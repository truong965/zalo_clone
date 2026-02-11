// src/services/conversation.service.ts
import { API_ENDPOINTS } from '@/constants/api-endpoints';
import type { ChatConversation } from '@/features/chat/types';
import apiClient from '@/lib/axios';
import type {
      ApiResponse,
      CursorPaginatedResponse,
      Conversation,
      ConversationListItem,
} from '@/types/api';

function mapConversationToUI(conv: Conversation): ChatConversation {
      return {
            ...conv,
            avatar: conv.avatarUrl || `https://i.pravatar.cc/150?u=${conv.id}`,
            lastMessage: 'Loading...',
            timestamp: conv.lastMessageAt
                  ? formatTimestamp(conv.lastMessageAt)
                  : 'Vừa xong',
            unread: 0, // TODO: Get from ConversationMember.unreadCount
            isOnline: false, // TODO: Get from Presence module
            isPinned: false, // TODO: Get from user settings
      };
}

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

function mapConversationListItemToUI(item: ConversationListItem): ChatConversation {
      const lastMessagePreview = item.lastMessage?.content ?? '';
      const timestamp = item.updatedAt ? formatTimestamp(item.updatedAt) : undefined;

      return {
            id: item.id,
            type: item.type,
            name: item.name ?? undefined,
            avatar: item.avatar ?? undefined,
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
      };
}

export interface ConversationMemberInfo {
      id: string;
      displayName: string;
      avatarUrl: string | null;
}

export const conversationService = {
      /**
       * Get user's conversations with cursor pagination
       */
      async getConversations(params?: {
            cursor?: string;
            limit?: number;
      }): Promise<CursorPaginatedResponse<ChatConversation>> {
            const response = await apiClient.get<ApiResponse<CursorPaginatedResponse<ConversationListItem>>>(
                  API_ENDPOINTS.CONVERSATIONS.GET_ALL,
                  { params }
            );

            const result = response.data.data;
            return {
                  data: result.data.map(mapConversationListItemToUI),
                  meta: result.meta,
            };

      },

      /**
       * Get or create direct conversation
       */
      async getOrCreateDirectConversation(recipientId: string): Promise<ChatConversation> {
            const response = await apiClient.post<ApiResponse<Conversation>>(
                  API_ENDPOINTS.CONVERSATIONS.CREATE,
                  { recipientId }
            );
            return mapConversationToUI(response.data.data);
      },

      /**
       * Get conversation by ID
       * Backend returns same shape as list API (ConversationListItem), not Conversation
       */
      async getConversationById(conversationId: string): Promise<ChatConversation> {
            const response = await apiClient.get<ApiResponse<ConversationListItem>>(
                  API_ENDPOINTS.CONVERSATIONS.GET_BY_ID(conversationId)
            );
            // console.log("conversation :", response.data.data);
            return mapConversationListItemToUI(response.data.data);
      },

      /**
       * Get conversation members (for sender filter in search)
       */
      async getConversationMembers(conversationId: string): Promise<ConversationMemberInfo[]> {
            const response = await apiClient.get<ApiResponse<ConversationMemberInfo[]>>(
                  API_ENDPOINTS.CONVERSATIONS.GET_MEMBERS(conversationId)
            );
            return response.data.data;
      },
};