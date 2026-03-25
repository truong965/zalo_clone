// ============================================================================
// ENUMS / UNION TYPES
// ============================================================================

export type SearchType = 'GLOBAL' | 'CONVERSATION' | 'CONTACT' | 'GROUP' | 'MEDIA' | 'FRIEND';
export type SearchErrorCode = 'INVALID_QUERY' | 'RATE_LIMIT' | 'SERVER_ERROR' | 'UNAUTHORIZED';
export type SearchTab = 'all' | 'messages' | 'contacts' | 'groups' | 'media';
export type SearchStatus = 'idle' | 'loading' | 'success' | 'error';
export type RelationshipStatus = 'FRIEND' | 'REQUEST' | 'NONE' | 'BLOCKED';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'FILE' | 'AUDIO' | 'LOCATION' | 'STICKER' | 'GIF' | 'SYSTEM' | 'CALL';
export type MediaType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';

// ============================================================================
// SEARCH FILTERS
// ============================================================================

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

export interface SearchSubscribePayload {
      keyword: string;
      conversationId?: string;
      searchType?: SearchType;
      filters?: SearchFilters;
}

export interface SearchLoadMorePayload {
      searchType: SearchType;
      keyword: string;
      cursor: string;
      limit?: number;
      conversationId?: string;
      mediaType?: MediaType;
      messageType?: MessageType;
      fromUserId?: string;
      startDate?: string;
      endDate?: string;
}

// ============================================================================
// SERVER → CLIENT PAYLOADS
// ============================================================================

export interface SearchResultsPayload {
      keyword: string;
      results: GlobalSearchResults;
      totalCount: number;
      executionTimeMs: number;
      searchType: SearchType;
}

export interface SearchMoreResultsPayload {
      searchType: string;
      data: unknown[];
      nextCursor?: string;
      hasNextPage: boolean;
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

export interface SearchSuggestionsPayload {
      prefix: string;
      suggestions: SearchSuggestion[];
}

export interface SearchErrorPayload {
      error: string;
      code: SearchErrorCode;
      timestamp: string;
}

// ============================================================================
// SEARCH RESULT DTOs
// ============================================================================

export interface ConversationMessageGroup {
      conversationId: string;
      conversationName: string;
      conversationAvatar?: string;
      conversationType: 'DIRECT' | 'GROUP';
      matchCount: number;
      latestMatch: MessageSearchResult;
      messages?: MessageSearchResult[];
}

export interface MediaSearchResult {
      id: string;
      messageId: string;
      conversationId: string;
      conversationName: string;
      mediaType: MediaType;
      originalName: string;
      mimeType: string;
      size: string | number;
      cdnUrl: string;
      thumbnailUrl?: string;
      uploadedBy: string;
      uploadedByName: string;
      createdAt: string;
}

export interface GlobalSearchResults {
      messages?: MessageSearchResult[];
      conversationMessages?: ConversationMessageGroup[];
      contacts: ContactSearchResult[];
      groups: GroupSearchResult[];
      media: MediaSearchResult[];
      mediaGrouped?: any[];
      totalCount: number;
      executionTimeMs: number;
}

export interface HighlightLocation {
      start: number;
      end: number;
      text: string;
}

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
      createdAt: string;
      rankScore?: number;
}

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
      lastSeenAt?: string;
      isOnline?: boolean;
      isPrivacyLimited?: boolean;
      existingConversationId?: string;
}

export interface GroupSearchResult {
      id: string;
      name: string;
      avatarUrl?: string;
      memberCount: number;
      membersPreview: string[];
      isUserMember: boolean;
      lastMessageAt?: string;
}

export interface SearchSuggestion {
      keyword: string;
      searchCount?: number;
      fromHistory?: boolean;
}

export interface SearchHistoryItem {
      id: string;
      keyword: string;
      searchType: SearchType;
      resultCount: number;
      executionTimeMs: number;
      createdAt: string; // ISO date
}

export interface TrendingKeyword {
      keyword: string;
      searchCount: number;
      avgResultCount: number;
      avgExecutionTimeMs: number;
}
