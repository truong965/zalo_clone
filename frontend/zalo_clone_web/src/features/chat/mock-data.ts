// src/features/chat/mock-data.ts
import type { ChatConversation, ChatMessage } from './types';
import type { CursorPaginatedResponse } from '@/types/api';
import { MessageType, ConversationType } from '@/types/api';

// ============================================================================
// MOCK CONVERSATIONS DATA
// ============================================================================

const allConversations: ChatConversation[] = Array.from({ length: 100 }, (_, i) => ({
      id: `${i + 1}`,
      type: i % 3 === 0 ? ConversationType.GROUP : ConversationType.DIRECT,
      name: `User ${i + 1}`,
      avatarUrl: `https://i.pravatar.cc/150?img=${i + 1}`,
      lastMessageAt: new Date(Date.now() - i * 60000).toISOString(),
      participants: [`user-${i}`, 'current-user'],
      requireApproval: false,
      settings: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // UI Fields
      avatar: `https://i.pravatar.cc/150?img=${i + 1}`,
      lastMessage: i % 5 === 0
            ? 'Đã gửi một ảnh'
            : `Tin nhắn mẫu số ${i + 1} - Lorem ipsum dolor sit amet`,
      timestamp: i < 10 ? 'Vừa xong' : i < 20 ? '5 phút' : `${i} phút`,
      unread: i % 4 === 0 ? Math.floor(Math.random() * 10) + 1 : 0,
      isOnline: i % 3 === 0,
      isPinned: i < 3,
}));

/**
 * Mock function to get conversations with cursor pagination
 */
export const mockGetConversations = (
      limit: number = 20,
      cursor?: string
): CursorPaginatedResponse<ChatConversation> => {
      let startIndex = 0;

      if (cursor) {
            const cursorIndex = allConversations.findIndex(c => c.id === cursor);
            startIndex = cursorIndex + 1;
      }

      const items = allConversations.slice(startIndex, startIndex + limit);
      const hasNextPage = startIndex + limit < allConversations.length;
      const nextCursor = hasNextPage ? items[items.length - 1]?.id : undefined;

      return {
            data: items,
            meta: {
                  limit,
                  hasNextPage,
                  nextCursor,
                  total: allConversations.length,
            },
      };
};

// ============================================================================
// MOCK MESSAGES DATA
// ============================================================================

const allMessages: ChatMessage[] = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      conversationId: '1',
      senderId: i % 2 === 0 ? 'user-1' : 'current-user',
      type: i % 5 === 0 ? MessageType.IMAGE : MessageType.TEXT,
      content: i % 2 === 0
            ? `Message from User 1: ${i === 0 ? 'Hello!' : `This is message ${i}`}`
            : `Your message: ${i === 1 ? 'Hi! How are you?' : `My response ${i}`}`,
      createdAt: new Date(Date.now() - (50 - i) * 60000).toISOString(),
      updatedAt: new Date(Date.now() - (50 - i) * 60000).toISOString(),
      // UI Fields
      sender: i % 2 === 0 ? ('other' as const) : ('me' as const),
      displayTimestamp: new Date(Date.now() - (50 - i) * 60000).toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
      }),
      senderName: i % 2 === 0 ? 'User 1' : 'You',
}));

/**
 * Mock function to get messages with cursor pagination
 */
export const mockGetMessages = (
      conversationId: string,
      limit: number = 20,
      cursor?: string
): CursorPaginatedResponse<ChatMessage> => {
      // Filter messages by conversation
      const conversationMessages = allMessages.filter(m => m.conversationId === conversationId);

      let startIndex = 0;
      if (cursor) {
            const cursorIndex = conversationMessages.findIndex(m => m.id.toString() === cursor);
            startIndex = cursorIndex + 1;
      }

      const items = conversationMessages.slice(startIndex, startIndex + limit);
      const hasNextPage = startIndex + limit < conversationMessages.length;
      const nextCursor = hasNextPage ? items[items.length - 1]?.id.toString() : undefined;

      return {
            data: items,
            meta: {
                  limit,
                  hasNextPage,
                  nextCursor,
                  total: conversationMessages.length,
            },
      };
};

/**
 * Pre-fetched mock data (for initial page load)
 */
export const mockConversations = mockGetConversations(20);
export const mockMessages = mockGetMessages('1', 20);