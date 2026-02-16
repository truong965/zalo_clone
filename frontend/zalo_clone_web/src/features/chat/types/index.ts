/**
 * Chat Feature Types
 * Combines API types with UI-specific fields
 */

import type {
  ConversationLastMessage,
  ConversationListItem,
  ConversationMember,
  MessageType,
  MessageListItem,
} from '@/types/api';
import type { ConversationUI } from '@/features/conversation/types/conversation';

// ============================================================================
// UI-SPECIFIC TYPES (Extend API types with UI fields)
// ============================================================================

/**
 * Conversation type for UI display
 * Extends API Conversation with UI-friendly fields for list rendering
 */
export type ChatConversation = ConversationUI;

export type ChatConversationListItem = Omit<ConversationListItem, 'unreadCount'> & {
  unreadCount?: number;
};

/**
 * Message type for UI display
 * Backend already returns sender object; keep it and add UI-only fields.
 */
export type ChatMessage = MessageListItem & {
  senderSide?: 'me' | 'other';
  displayTimestamp?: string;
  avatar?: string;
  senderName?: string;
};

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface SendMessageRequest {
  conversationId: string;
  clientMessageId: string;
  type: MessageType;
  content?: string;
  metadata?: Record<string, unknown>;
  replyTo?: { messageId: string };
  mediaIds?: string[];
}

export interface EditMessageRequest {
  messageId: string;
  content: string;
}

export interface DeleteMessageRequest {
  messageId: string;
  conversationId: string;
}

export interface MarkAsReadRequest {
  conversationId: string;
  messageIds: string[];
}

export interface TypingRequest {
  conversationId: string;
  isTyping: boolean;
}

// ============================================================================
// STATE TYPES
// ============================================================================

export interface ChatState {
  conversations: ChatConversation[];
  selectedConversationId: string | null;
  messages: ChatMessage[];
  members: ConversationMember[];
  isLoading: boolean;
  error: string | null;
  isTyping: boolean;
  typingUsers: string[]; // IDs of users currently typing
}

// ============================================================================
// UI CONTROL TYPES
// ============================================================================

export type RightSidebarState = 'none' | 'search' | 'info';
export type ConversationFilterTab = 'all' | 'unread';
