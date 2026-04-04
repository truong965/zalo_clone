/**
 * Chat Feature Types
 * Combines API types with UI-specific fields
 */

import type {
  ConversationUI,
  ConversationListItem,
  ConversationMember,
  MessageType,
  MessageListItem,
} from '@/types/api';
export type { ConversationUI } from '@/types/api';

// ============================================================================
// UI-SPECIFIC TYPES (Extend API types with UI fields)
// ============================================================================

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

export interface AiChatMessage {
  id: string;
  requestId?: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  status?: 'pending' | 'streaming' | 'completed' | 'error';
  responseType?: 'ask' | 'agent' | 'summary';
  isThoughtVisible?: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface AiRequestProgress {
  step: string;
  message?: string;
  percent?: number;
}

export interface AiRequestError {
  code: string;
  message: string;
  retriable?: boolean;
}

export interface AiRequestState {
  requestId: string;
  conversationId: string;
  responseType: 'ask' | 'agent' | 'summary';
  status: 'started' | 'progress' | 'streaming' | 'completed' | 'error';
  createdAt: string;
  updatedAt: string;
  userMessageId?: string;
  assistantMessageId?: string;
  progress?: AiRequestProgress;
  thought?: string;
  content: string;
  isThoughtVisible?: boolean;
  error?: AiRequestError;
  sessionId?: string;
}

export interface AiConversationState {
  conversationId: string;
  activeRequestId: string | null;
  messages: AiChatMessage[];
  requests: Record<string, AiRequestState>;
}

export interface ChatState {
  conversations: ConversationUI[];
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

export type RightSidebarState = 'none' | 'search' | 'info' | 'media-browser' | 'ai-summary' | 'ai-assistant';
export type ConversationFilterTab = 'all' | 'unread' | 'archived';
