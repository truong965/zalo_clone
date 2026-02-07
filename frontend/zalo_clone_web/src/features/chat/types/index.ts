/**
 * Chat Feature Types
 * Combines API types with UI-specific fields
 */

import type {
  Conversation as ApiConversation,
  ConversationLastMessage,
  ConversationListItem,
  ConversationMember,
  MessageType,
  MessageListItem,
} from '@/types/api';

// ============================================================================
// UI-SPECIFIC TYPES (Extend API types with UI fields)
// ============================================================================

/**
 * Conversation type for UI display
 * Extends API Conversation with UI-friendly fields for list rendering
 */
export interface ChatConversation extends ApiConversation {
  // UI Fields (not from API)
  avatar?: string; // User avatar or group avatar
  lastMessage?: string; // Latest message preview text
  timestamp?: string; // Formatted time like "24/01", "Vài giây"
  unread?: number; // Unread message count
  isOnline?: boolean; // User online status
  isPinned?: boolean; // Pinned in list

  // API fields from conversation list endpoint
  updatedAt?: string;
  lastMessageObj?: ConversationLastMessage | null;
  unreadCount?: number;
  lastReadMessageId?: string | null;
  isBlocked?: boolean;
}

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
