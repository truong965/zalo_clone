/**
 * Chat Feature Types
 * Combines API types with UI-specific fields
 */

import type {
  Conversation as ApiConversation,
  Message as ApiMessage,
  MediaAttachment,
  ConversationMember,
  MessageType,
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
}

/**
 * Message type for UI display
 * Extends API Message with UI-friendly fields
 */
export interface ChatMessage extends Omit<ApiMessage, 'isRead'> {
  // UI Fields
  sender?: 'me' | 'other';
  displayTimestamp?: string; // Formatted time
  avatar?: string; // Sender avatar
  senderName?: string; // Sender display name
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface SendMessageRequest {
  conversationId: string;
  content: string;
  type?: MessageType;
  mediaAttachments?: MediaAttachment[];
  replyToId?: number;
}

export interface EditMessageRequest {
  messageId: number;
  content: string;
}

export interface DeleteMessageRequest {
  messageId: number;
  conversationId: string;
}

export interface MarkAsReadRequest {
  conversationId: string;
  messageId?: number;
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
