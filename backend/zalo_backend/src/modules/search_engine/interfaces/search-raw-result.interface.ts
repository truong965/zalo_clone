import { MessageType, Message } from '@prisma/client';

/**
 * Raw Query Result Interfaces (Phase C: TD-17)
 *
 * Typed interfaces for raw SQL query results from Prisma.$queryRawUnsafe().
 * Replaces `any[]` returns in MessageSearchRepository and ContactSearchRepository.
 *
 * Column names use snake_case to match PostgreSQL convention in raw queries.
 */

// ============================================================================
// MESSAGE SEARCH RAW RESULTS
// ============================================================================

/**
 * Base fields shared by all raw message query results.
 * Both search and context queries return these columns.
 */
export interface RawMessageBaseResult {
  id: bigint;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  sender_avatar_url: string | null;
  conversation_type: 'DIRECT' | 'GROUP';
  conversation_name: string | null;
  type: MessageType;
  content: string | null;
  created_at: Date;
}

/**
 * Raw result from message search queries (searchInConversation, searchGlobal).
 * Extends base with full-text search scoring and interaction counts.
 */
export interface RawMessageSearchResult extends RawMessageBaseResult {
  /** ts_headline output for keyword highlighting */
  preview_snippet: string | null;
  /** ts_rank score from full-text search (0-1) */
  rank_score: number | null;
  /** Number of replies to this message */
  reply_count: number;
  /** Number of SEEN receipts */
  seen_count: number;
}

/**
 * Raw result from message context query (getMessageContext).
 * Extends base with target marker flag.
 */
export interface RawMessageContextResult extends RawMessageBaseResult {
  /** Whether this is the target message */
  is_target: boolean;
}

/**
 * Raw result from global search grouped by conversation.
 * CTE query returns one row per conversation with match count and latest match details.
 */
export interface RawGroupedMessageResult {
  conversation_id: string;
  conversation_name: string | null;
  conversation_type: 'DIRECT' | 'GROUP';
  conversation_avatar: string | null;
  match_count: number;
  /** Latest matching message fields */
  latest_message_id: bigint;
  sender_id: string;
  sender_name: string | null;
  content: string | null;
  preview_snippet: string | null;
  created_at: Date;
}

/**
 * Structured return from getMessageContext().
 */
export interface MessageContextResult {
  messages: RawMessageContextResult[];
  targetMessage: RawMessageContextResult | undefined;
  totalInRange: number;
}

// ============================================================================
// CONTACT SEARCH RAW RESULTS
// ============================================================================

/**
 * Raw result from contact search queries (searchContacts).
 */
export interface RawContactSearchResult {
  id: string;
  phone_number: string;
  display_name: string;
  avatar_url: string | null;
  /** COALESCE(alias, displayName) — the final displayed name */
  display_name_final: string;
  /** Priority: 1=alias, 2=friend, 3=request pending, 4=none */
  relevance_score: number;
  /** Calculated relationship status */
  relationship_status: 'BLOCKED' | 'FRIEND' | 'REQUEST' | 'NONE';
  /** Whether user has an alias set */
  has_alias: boolean;
  /** Existing DIRECT conversation ID (null if never messaged) */
  existing_conversation_id: string | null;
  /** Privacy-enriched fields (added by service layer after privacy check) */
  canMessage?: boolean;
  lastSeenAt?: Date;
  isOnline?: boolean;
  showProfile?: 'EVERYONE' | 'CONTACTS';
  /** Allow additional dynamic fields from different query shapes */
  [key: string]: unknown;
}

/**
 * Raw result from alias-only search (searchByAlias).
 * Subset of RawContactSearchResult.
 */
export interface RawAliasSearchResult {
  id: string;
  phone_number: string;
  display_name: string;
  avatar_url: string | null;
  display_name_final: string;
  has_alias: true;
  [key: string]: unknown;
}

// ============================================================================
// GROUP SEARCH RAW RESULTS (B1)
// ============================================================================

/**
 * Raw result from group/conversation search queries.
 * Searches conversations of type GROUP by name.
 */
export interface RawGroupSearchResult {
  id: string;
  name: string;
  avatar_url: string | null;
  member_count: number;
  /** JSON array of first 3 member display names (parsed by Prisma from json_agg) */
  members_preview: string[];
  is_user_member: boolean;
  last_message_at: Date | null;
}

// ============================================================================
// MEDIA SEARCH RAW RESULTS (B2)
// ============================================================================

/**
 * Raw result from media attachment search queries.
 * Searches media_attachments by original_name.
 */
export interface RawMediaSearchResult {
  id: string;
  message_id: bigint;
  original_name: string;
  media_type: string;
  mime_type: string;
  size: bigint;
  thumbnail_url: string | null;
  cdn_url: string | null;
  uploaded_by: string;
  uploaded_by_name: string;
  conversation_id: string;
  conversation_name: string | null;
  created_at: Date;
}

/**
 * Raw result from media search grouped by conversation.
 * CTE query returns one row per conversation with match count and latest match.
 */
export interface RawMediaGroupedResult {
  conversation_id: string;
  conversation_name: string | null;
  conversation_type: 'DIRECT' | 'GROUP';
  conversation_avatar: string | null;
  match_count: number;
  latest_media_id: string;
  original_name: string;
  media_type: string;
  mime_type: string;
  size: bigint;
  thumbnail_url: string | null;
  cdn_url: string | null;
  uploaded_by_name: string;
  latest_created_at: Date;
}

// ============================================================================
// ENRICHED MESSAGE TYPE (B5: Multi-entity matching)
// ============================================================================

/**
 * Message with optional search-relevant relations.
 * Used by RealTimeSearchService.findMatchingSubscriptions() for B5 multi-entity matching
 * (group name, media filename in addition to message content).
 *
 * Extends Prisma's Message with optional relations that are populated
 * when the message is fetched with includes in SearchEventListener.
 */
export interface MessageWithSearchContext extends Message {
  conversation?: {
    id: string;
    type: string;
    name: string | null;
  } | null;
  sender?: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    phoneNumber: string;
  } | null;
  mediaAttachments?: Array<{
    originalName: string;
  }>;
}
