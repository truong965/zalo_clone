/**
 * Mobile Conversation Search — Types
 *
 * Mirror từ web: frontend/zalo_clone_web/src/features/search/types/index.ts
 * Chỉ bao gồm những gì cần thiết cho conversation-scoped search trên mobile.
 */

// ─── Status ───────────────────────────────────────────────────────────────────

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface ConversationSearchFilters {
  fromUserId?: string;
  startDate?: string; // ISO date string
  endDate?: string;   // ISO date string
}

export interface ConversationSearchMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
}

// ─── Result DTO ───────────────────────────────────────────────────────────────

export interface MessageSearchResult {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  content?: string;
  preview: string;
  highlights: Array<{ start: number; end: number; text: string }>;
  createdAt: string; // ISO date string
}

// ─── Socket Payloads (Client → Server) ───────────────────────────────────────

export interface SearchSubscribePayload {
  keyword: string;
  searchType: 'CONVERSATION';
  conversationId: string;
  filters?: {
    fromUserId?: string;
    startDate?: string;
    endDate?: string;
  };
}

// ─── Socket Payloads (Server → Client) ───────────────────────────────────────

export interface SearchResultsPayload {
  keyword: string;
  results: {
    messages?: MessageSearchResult[];
    contacts: never[];
    groups: never[];
    media: never[];
    totalCount: number;
    executionTimeMs: number;
  };
  searchType: string;
}

export interface SearchNewMatchPayload {
  keyword: string;
  message: MessageSearchResult;
  conversationId: string;
  matchedAt: string;
}

export interface SearchResultRemovedPayload {
  messageId: string;
  conversationId: string;
  removedAt: string;
}

export interface SearchErrorPayload {
  error: string;
  code: string;
  timestamp: string;
}
