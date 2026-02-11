import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MessageType, MediaType } from '@prisma/client';
import { CursorPaginationDto } from '@common/dto/cursor-pagination.dto';

/**
 * Search Type Enum
 * Defines the scope of search operations
 */
export enum SearchType {
  GLOBAL = 'GLOBAL',
  CONVERSATION = 'CONVERSATION',
  CONTACT = 'CONTACT',
  MEDIA = 'MEDIA',
}

/**
 * Typed Search Filters
 * Replaces 'any' type in SearchQueryLog
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
// SEARCH REQUEST DTOs
// ============================================================================

export class MessageSearchRequestDto extends CursorPaginationDto {
  @IsString()
  keyword: string;

  /**
   * Override default limit from CursorPaginationDto (20 → 50)
   * CursorPaginationDto already has @IsOptional, @IsInt, @Min(1), @Max(100)
   */
  override limit?: number = 50;

  @IsOptional()
  @IsEnum(MessageType)
  messageType?: MessageType;

  @IsOptional()
  @IsUUID()
  fromUserId?: string; // Filter: messages from specific user

  @IsOptional()
  @IsString()
  startDate?: string; // ISO format date

  @IsOptional()
  @IsString()
  endDate?: string; // ISO format date

  @IsOptional()
  @Type(() => Boolean)
  hasMedia?: boolean; // Phase 4: Filter messages with/without media attachments
}

export class ContactSearchRequestDto extends CursorPaginationDto {
  @IsString()
  keyword: string;

  /**
   * Override default limit from CursorPaginationDto (20 → 50)
   */
  override limit?: number = 50;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  excludeIds?: string[]; // Exclude user IDs from results

  @IsOptional()
  hasAlias?: boolean; // Filter: only contacts with alias
  // override cursor?: string;
}

export class GlobalSearchRequestDto {
  @IsString()
  keyword: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number = 20; // Total limit across all types

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limitPerType?: number = 5; // Limit per search type
}

export class MediaSearchRequestDto extends CursorPaginationDto {
  @IsString()
  keyword: string;

  @IsOptional()
  @IsEnum(MediaType)
  mediaType?: MediaType;

  /**
   * Override default limit from CursorPaginationDto (20 → 30)
   */
  override limit?: number = 30;

  /** Cursor for pagination — Base64-encoded (createdAt, id) */
  // override cursor?: string;
}

export class GroupSearchRequestDto extends CursorPaginationDto {
  @IsString()
  keyword: string;

  /**
   * Override default limit from CursorPaginationDto (20 → 50)
   */
  override limit?: number = 50;

  /** Cursor for pagination — Base64-encoded (prefixMatch, lastMessageAt, id) */
  // override cursor?: string;
}

// ============================================================================
// SEARCH RESPONSE DTOs
// ============================================================================

export class MessageSearchResultDto {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  conversationName?: string;
  conversationType: 'DIRECT' | 'GROUP';
  type: MessageType;
  content?: string;
  preview: string; // Highlighted snippet with context
  highlights: HighlightLocation[];
  createdAt: Date;
  rankScore?: number; // Relevance score (0-1)
}

export class HighlightLocation {
  start: number;
  end: number;
  text: string;
}

export class ContactSearchResultDto {
  id: string;
  phoneNumber: string;
  displayName: string; // Alias or real name
  displayNameFinal: string; // Returned name to show
  avatarUrl?: string;
  relationshipStatus: 'FRIEND' | 'REQUEST' | 'NONE' | 'BLOCKED';
  hasAlias: boolean;
  aliasPriority: number; // 1=alias exists, 2=friend, 3=request, 4=none
  isBlocked?: boolean;

  // Phase 4: Privacy enforcement
  canMessage?: boolean; // Can send message based on whoCanMessageMe privacy
  lastSeenAt?: Date; // Only included if showOnlineStatus allows
  isOnline?: boolean; // Only included if showOnlineStatus allows

  // Existing DIRECT conversation (null if never messaged)
  existingConversationId?: string;
}

export class GroupSearchResultDto {
  id: string;
  name: string;
  avatarUrl?: string;
  memberCount: number;
  membersPreview: string[]; // First 3 member names
  isUserMember: boolean;
  lastMessageAt?: Date;
}

export class MediaSearchResultDto {
  id: string;
  messageId: string;
  originalName: string;
  mediaType: MediaType;
  mimeType: string;
  size: number;
  thumbnailUrl?: string;
  cdnUrl?: string;
  uploadedBy: string;
  uploadedByName: string;
  conversationId: string;
  conversationName?: string;
  createdAt: Date;
}

/**
 * Conversation-grouped message result for global search
 * Instead of showing individual messages, groups by conversation with match count
 */
export class ConversationGroupedMessageDto {
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
    createdAt: Date;
  };
}

export class GlobalSearchResultsDto {
  /** Individual messages — used by CONVERSATION search */
  messages?: MessageSearchResultDto[];
  /** Grouped by conversation — used by GLOBAL search */
  conversationMessages?: ConversationGroupedMessageDto[];
  contacts: ContactSearchResultDto[];
  groups: GroupSearchResultDto[];
  media: MediaSearchResultDto[];
  /** Grouped media by conversation — used by GLOBAL search */
  mediaGrouped?: MediaGroupedByConversationDto[];
  totalCount: number;
  executionTimeMs: number;
}

// ============================================================================
// MESSAGE CONTEXT DTO (Load Around ID)
// ============================================================================

export class MessageContextRequestDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  before?: number = 10; // Load 10 messages before target

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  after?: number = 10; // Load 10 messages after target
}

export class MessageContextResponseDto {
  messages: MessageSearchResultDto[];
  targetMessage: MessageSearchResultDto;
  totalInRange: number;
}

// ============================================================================
// MEDIA GROUPED BY CONVERSATION DTO (Phase 2)
// ============================================================================

/**
 * Media grouped by conversation result for global search.
 * Instead of flat media list, groups by conversation with match count.
 */
export class MediaGroupedByConversationDto {
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
    createdAt: Date;
  };
}

// ============================================================================
// SEARCH LOAD MORE DTOs (Phase 2: Pagination)
// ============================================================================

/**
 * Payload for search:loadMore WebSocket event
 * Client sends this to request the next page of results
 */
export class SearchLoadMoreRequestDto {
  @IsString()
  searchType: 'CONVERSATION' | 'GLOBAL' | 'CONTACT' | 'GROUP' | 'MEDIA';

  @IsString()
  keyword: string;

  @IsString()
  cursor: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsEnum(MediaType)
  mediaType?: MediaType;
}

/**
 * Response for search:moreResults WebSocket event
 */
export class SearchMoreResultsDto {
  searchType: string;
  data: unknown[];
  nextCursor?: string;
  hasNextPage: boolean;
}
