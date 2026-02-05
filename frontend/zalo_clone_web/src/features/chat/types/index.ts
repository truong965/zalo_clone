/**
 * Types cho Chat module
 */

import type { Message, Conversation, MediaFile } from '@/types';

export type { Message, Conversation, MediaFile };

export interface ChatState {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  isTyping: boolean;
  typingUser: string | null;
}

export interface SendMessageRequest {
  conversationId: string;
  content: string;
  media?: MediaFile[];
  replyToId?: string;
}

export interface EditMessageRequest {
  messageId: string;
  content: string;
}

export interface DeleteMessageRequest {
  messageId: string;
  conversationId: string;
}
