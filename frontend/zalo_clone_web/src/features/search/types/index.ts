/**
 * Search Feature Types
 *
 * Mirror backend DTOs from modules/search_engine/dto/search.dto.ts
 * và common/interfaces/search-socket.interface.ts
 *
 * Lưu ý:
 * - bigint → string (WsTransformInterceptor serialize BigInt → string)
 * - Date → string (JSON serialize Date → ISO string)
 * - Re-use MessageType, MediaType từ @/types/api
 */

import type { MessageType, MediaType } from '@/types/api';

// ============================================================================
// ENUMS / UNION TYPES
// ============================================================================

/** Search scope — maps to backend SearchType enum */
export type SearchType = 'GLOBAL' | 'CONVERSATION' | 'CONTACT' | 'MEDIA';

/** Error codes from SearchGateway */
export type SearchErrorCode =
      | 'INVALID_QUERY'
      | 'RATE_LIMIT'
      | 'SERVER_ERROR'
      | 'UNAUTHORIZED';

/** UI tab selection */
export type SearchTab = 'all' | 'messages' | 'contacts' | 'groups' | 'media';

/** Search operation status */
export type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

/** Contact relationship status from backend */
export type RelationshipStatus = 'FRIEND' | 'REQUEST' | 'NONE' | 'BLOCKED';

// ============================================================================
// SEARCH FILTERS
// ============================================================================

/**
 * Typed search filters — maps to backend SearchFilters interface
 */
export interface SearchFilters {
      conversationId?: string;
      messageType?: MessageType;
      mediaType?: MediaType;
      fromUserId?: string;
      startDate?: string;
      endDate?: string;
      excludeIds?: string[];
      hasAlias?: boolean;
}

// ============================================================================
// CLIENT → SERVER PAYLOADS
// ============================================================================

/**
 * Payload for search:subscribe event
 * Maps to backend SearchSubscribePayload
 */
export interface SearchSubscribePayload {
      keyword: string;
      conversationId?: string;
      searchType?: SearchType;
      filters?: {
            messageType?: MessageType;
            mediaType?: MediaType;
            fromUserId?: string;
            startDate?: string; // ISO date string
            endDate?: string;   // ISO date string
      };
}

/**
 * Payload for search:loadMore event (client → server)
 */
export interface SearchLoadMorePayload {
      searchType: 'CONVERSATION' | 'GLOBAL' | 'CONTACT' | 'GROUP' | 'MEDIA';
      keyword: string;
      cursor: string;
      limit?: number;
      conversationId?: string;
      mediaType?: MediaType;
      // Conversation filters (needed for filter-only browse pagination)
      messageType?: MessageType;
      fromUserId?: string;
      startDate?: string;
      endDate?: string;
}

/**
 * Payload for search:moreResults event (server → client)
 */
export interface SearchMoreResultsPayload {
      searchType: string;
      data: unknown[];
      nextCursor?: string;
      hasNextPage: boolean;
}

/**
 * Payload for search:updateQuery event
 * Maps to backend SearchUpdateQueryPayload
 */
export interface SearchUpdateQueryPayload {
      keyword: string;
      conversationId?: string;
}

// ============================================================================
// SERVER → CLIENT PAYLOADS
// ============================================================================

/**
 * Initial search results response
 * Maps to backend SearchResultsPayload
 */
export interface SearchResultsPayload {
      keyword: string;
      results: GlobalSearchResults;
      totalCount: number;
      executionTimeMs: number;
      searchType: SearchType;
}

/**
 * New message matches active search
 * Maps to backend SearchNewMatchPayload
 */
export interface SearchNewMatchPayload {
      keyword: string;
      message: MessageSearchResult;
      conversationId: string;
      matchedAt: string; // ISO date
}

/**
 * Search result removed (message deleted)
 * Maps to backend SearchResultRemovedPayload
 */
export interface SearchResultRemovedPayload {
      messageId: string;
      conversationId: string;
      removedAt: string; // ISO date
}

/**
 * Autocomplete suggestions from server
 * Maps to backend SearchSuggestionsPayload
 */
export interface SearchSuggestionsPayload {
      prefix: string;
      suggestions: SearchSuggestion[];
}

/**
 * Search error notification
 * Maps to backend SearchErrorPayload
 */
export interface SearchErrorPayload {
      error: string;
      code: SearchErrorCode;
      timestamp: string; // ISO date
}

// ============================================================================
// SEARCH RESULT DTOs
// ============================================================================

/**
 * Conversation-grouped message result for global search.
 * Maps to backend ConversationGroupedMessageDto.
 * Instead of individual messages, shows one entry per conversation with match count.
 */
export interface ConversationMessageGroup {
      conversationId: string;
      conversationName: string;
      conversationType: 'DIRECT' | 'GROUP';
      conversationAvatar?: string;
      matchCount: number;
      latestMatch: {
            id: string;
            senderId: string;
            senderName: string;
            preview: string;
            highlights: HighlightLocation[];
            createdAt: string; // ISO date
      };
}

/**
 * Media grouped by conversation result for global search.
 * Maps to backend MediaGroupedByConversationDto.
 */
export interface MediaGroupedByConversation {
      conversationId: string;
      conversationName: string;
      conversationType: 'DIRECT' | 'GROUP';
      conversationAvatar?: string;
      matchCount: number;
      latestMatch: {
            id: string;
            originalName: string;
            mediaType: MediaType;
            mimeType: string;
            size: number;
            thumbnailUrl?: string;
            cdnUrl?: string;
            uploadedByName: string;
            createdAt: string; // ISO date
      };
}

/**
 * Global search results — aggregated across all types
 * Maps to backend GlobalSearchResultsDto
 *
 * Note: `messages` is used by conversation-scoped search (individual messages),
 * `conversationMessages` is used by global search (grouped by conversation).
 * Both are optional since only one will be populated depending on search type.
 */
export interface GlobalSearchResults {
      messages?: MessageSearchResult[];
      conversationMessages?: ConversationMessageGroup[];
      contacts: ContactSearchResult[];
      groups: GroupSearchResult[];
      media: MediaSearchResult[];
      mediaGrouped?: MediaGroupedByConversation[];
      totalCount: number;
      executionTimeMs: number;
}

/**
 * Highlight location within text
 * Maps to backend HighlightLocation
 */
export interface HighlightLocation {
      start: number;
      end: number;
      text: string;
}

/**
 * Message search result
 * Maps to backend MessageSearchResultDto
 * Note: id is string (BigInt serialized by WsTransformInterceptor)
 */
export interface MessageSearchResult {
      id: string;
      conversationId: string;
      senderId: string;
      senderName: string;
      senderAvatarUrl?: string;
      conversationName?: string;
      conversationType: 'DIRECT' | 'GROUP';
      type: MessageType;
      content?: string;
      preview: string;
      highlights: HighlightLocation[];
      createdAt: string; // ISO date
      rankScore?: number;
}

/**
 * Contact search result
 * Maps to backend ContactSearchResultDto
 */
export interface ContactSearchResult {
      id: string;
      phoneNumber?: string;
      displayName: string;
      displayNameFinal: string;
      avatarUrl?: string;
      relationshipStatus: RelationshipStatus;
      requestDirection?: 'OUTGOING' | 'INCOMING';
      pendingRequestId?: string;
      hasAlias: boolean;
      aliasPriority: number;
      isBlocked?: boolean;
      canMessage?: boolean;
      lastSeenAt?: string; // ISO date
      isOnline?: boolean;
      isPrivacyLimited?: boolean;
      /** Existing DIRECT conversation ID (null/undefined if never messaged) */
      existingConversationId?: string;
}

/**
 * Group search result
 * Maps to backend GroupSearchResultDto
 */
export interface GroupSearchResult {
      id: string;
      name: string;
      avatarUrl?: string;
      memberCount: number;
      membersPreview: string[];
      isUserMember: boolean;
      lastMessageAt?: string; // ISO date
}

/**
 * Media search result
 * Maps to backend MediaSearchResultDto
 * Note: messageId and size are strings (BigInt serialized)
 */
export interface MediaSearchResult {
      id: string;
      messageId: string;
      originalName: string;
      mediaType: MediaType;
      mimeType: string;
      size: string;
      thumbnailUrl?: string;
      cdnUrl?: string;
      uploadedBy: string;
      uploadedByName: string;
      conversationId: string;
      conversationName?: string;
      createdAt: string; // ISO date
}

// ============================================================================
// MESSAGE CONTEXT (Jump to message)
// ============================================================================

/**
 * Message context response — load messages around a target
 * Maps to backend MessageContextResponseDto
 */
export interface MessageContextResponse {
      messages: MessageSearchResult[];
      targetMessage: MessageSearchResult;
      totalInRange: number;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

/**
 * Search history item from analytics API
 */
export interface SearchHistoryItem {
      id: string;
      keyword: string;
      searchType: SearchType;
      resultCount: number;
      executionTimeMs: number;
      createdAt: string; // ISO date
}

/**
 * Search suggestion — from history or trending
 */
export interface SearchSuggestion {
      keyword: string;
      searchCount?: number;
      fromHistory?: boolean;
}

/**
 * Trending keyword from analytics
 */
export interface TrendingKeyword {
      keyword: string;
      searchCount: number;
      avgResultCount: number;
      avgExecutionTimeMs: number;
}

// ============================================================================
// SOCKET ACK TYPES
// ============================================================================

/**
 * Socket acknowledgment — discriminated union for success/error
 * Same pattern as useMessageSocket's SocketAck
 */
export type SearchSocketAck<T = Record<string, unknown>> =
      | ({ error?: undefined } & T)
      | { error: string };

/**
 * Ack from search:subscribe
 */
export interface SearchSubscribeAck {
      status: 'subscribed' | 'error';
      keyword: string;
      message?: string;
}

/**
 * Ack from search:unsubscribe
 */
export interface SearchUnsubscribeAck {
      status: 'unsubscribed' | 'error';
}

/**
 * Ack from search:updateQuery
 */
export interface SearchUpdateQueryAck {
      status: 'updated' | 'error';
}

// ============================================================================
// UI HELPER TYPES
// ============================================================================

/**
 * Map SearchTab → SearchType for backend subscription
 */
export const SEARCH_TAB_TO_TYPE: Record<SearchTab, SearchType> = {
      all: 'GLOBAL',
      messages: 'CONVERSATION',
      contacts: 'CONTACT',
      groups: 'GLOBAL', // No GROUP-specific search type — use GLOBAL
      media: 'MEDIA',
} as const;

/**
 * Default empty results
 */
export const EMPTY_SEARCH_RESULTS: GlobalSearchResults = {
      messages: [],
      conversationMessages: [],
      contacts: [],
      groups: [],
      media: [],
      mediaGrouped: [],
      totalCount: 0,
      executionTimeMs: 0,
};
