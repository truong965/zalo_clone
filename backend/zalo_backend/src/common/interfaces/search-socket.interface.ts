import { MessageType, MediaType } from '@prisma/client';
import {
  MessageSearchResultDto,
  GlobalSearchResultsDto,
} from 'src/modules/search_engine/dto/search.dto';

/**
 * Search Socket Interfaces (Phase 4: Real-Time Search)
 * Type-safe payloads for WebSocket search events
 */

// ============================================================================
// CLIENT → SERVER (Subscribe/Update)
// ============================================================================

/**
 * Payload for subscribing to real-time search updates
 */
export interface SearchSubscribePayload {
  keyword: string;
  conversationId?: string; // Optional: scope search to specific conversation
  searchType?: 'GLOBAL' | 'CONVERSATION' | 'CONTACT' | 'MEDIA';
  filters?: {
    messageType?: MessageType;
    mediaType?: MediaType;
    fromUserId?: string;
    startDate?: string; // ISO date string
    endDate?: string;   // ISO date string
  };
}

/**
 * Payload for updating search query (debounced)
 */
export interface SearchUpdateQueryPayload {
  keyword: string;
  conversationId?: string;
}

/**
 * Payload for requesting more results (pagination)
 */
export interface SearchLoadMorePayload {
  searchType: 'CONVERSATION' | 'GLOBAL' | 'CONTACT' | 'GROUP' | 'MEDIA';
  keyword: string;
  cursor: string;
  limit?: number;
  conversationId?: string;
  mediaType?: MediaType;
}

/**
 * Response for paginated "more results"
 */
export interface SearchMoreResultsPayload {
  searchType: string;
  data: unknown[];
  nextCursor?: string;
  hasNextPage: boolean;
}

// ============================================================================
// SERVER → CLIENT (Results/Updates)
// ============================================================================

/**
 * Initial search results response
 *
 * B3: `results` is always `GlobalSearchResultsDto` — a unified shape that works
 * for all search types. For non-GLOBAL searches, only the relevant sub-array
 * is populated (messages for CONVERSATION, contacts for CONTACT, etc.).
 */
export interface SearchResultsPayload {
  keyword: string;
  results: GlobalSearchResultsDto;
  totalCount: number;
  executionTimeMs: number;
  searchType: 'GLOBAL' | 'CONVERSATION' | 'CONTACT' | 'MEDIA';
}

/**
 * New message matches active search
 */
export interface SearchNewMatchPayload {
  keyword: string;
  message: MessageSearchResultDto;
  conversationId: string;
  matchedAt: Date;
}

/**
 * Search result removed (message deleted)
 */
export interface SearchResultRemovedPayload {
  messageId: string;
  conversationId: string;
  removedAt: Date;
}

/**
 * Autocomplete suggestions
 */
export interface SearchSuggestionsPayload {
  prefix: string;
  suggestions: Array<{
    keyword: string;
    searchCount?: number; // Trending count
    fromHistory?: boolean; // User's search history
  }>;
}

/**
 * Search error notification
 */
export interface SearchErrorPayload {
  error: string;
  code: 'INVALID_QUERY' | 'RATE_LIMIT' | 'SERVER_ERROR' | 'UNAUTHORIZED';
  timestamp: Date;
}

// ============================================================================
// INTERNAL (Service Layer)
// ============================================================================

/**
 * Active search subscription
 * Stored in-memory by RealTimeSearchService
 */
export interface SearchSubscription {
  socketId: string;
  userId: string;
  keyword: string;
  conversationId?: string;
  searchType: 'GLOBAL' | 'CONVERSATION' | 'CONTACT' | 'MEDIA';
  filters?: {
    messageType?: MessageType;
    mediaType?: MediaType;
    fromUserId?: string;
  };
  /** Conversation IDs the user has ACTIVE membership in (A1: access control) */
  allowedConversationIds: Set<string>;
  createdAt: Date;
  lastMatchedAt?: Date;
}

/**
 * Search subscription cache entry
 * Used for fast keyword matching
 */
export interface SearchSubscriptionCache {
  subscriptions: Map<string, Set<SearchSubscription>>; // userId → Set<Subscription>
  keywordIndex: Map<string, Set<string>>; // keyword → Set<socketId>
  totalSubscriptions: number;
  maxSubscriptionsPerUser: number;
}
