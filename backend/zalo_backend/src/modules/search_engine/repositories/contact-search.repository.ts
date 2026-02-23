import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { ContactSearchResultDto } from '../dto/search.dto';
import { PaginationUtil } from '../utils/pagination.util';
import type {
  RawContactSearchResult,
  RawContactNameSearchResult,
} from '../interfaces/search-raw-result.interface';

/**
 * Contact Search Repository
 * Handles database queries for user/contact searching
 * Implements alias priority logic
 */

@Injectable()
export class ContactSearchRepository {
  constructor(private prisma: PrismaService) { }

  /**
   * Search contacts with alias priority
   *
   * Logic:
   * 1. Look for alias in UserContact table (ownerId = searcherId)
   * 2. Fallback to User displayName
   * 3. Filter by friendship status for ranking
   * 4. Exclude blocked users and blockers
   *
   * Uses parameterized queries to prevent SQL injection
   */
  async searchContacts(
    searcherId: string,
    keyword: string,
    limit = 50,
    excludeIds: string[] = [],
    cursor?: string,
  ): Promise<RawContactSearchResult[]> {
    const normalizedLimit = PaginationUtil.normalizeLimit(limit, 200);

    // Decode cursor for pagination: { relevanceScore, sortName, id }
    let cursorClause = '';
    const cursorParams: (string | number)[] = [];
    if (cursor) {
      const decoded = PaginationUtil.decodeCursor(cursor);
      if (decoded) {
        const payload = decoded as unknown as {
          relevanceScore: number;
          sortName: string;
          lastId: string;
        };
        // Parameter indices depend on excludeIds presence
        const baseIdx = excludeIds.length > 0 ? 5 : 4;
        cursorClause = `
          AND (
            (CASE
              WHEN uc.alias_name IS NOT NULL THEN 1
              WHEN uc.phone_book_name IS NOT NULL THEN 2
              WHEN f.status = 'ACCEPTED' THEN 3
              WHEN f.status = 'PENDING' THEN 4
              ELSE 5
            END) > $${baseIdx}::int
            OR (
              (CASE
                WHEN uc.alias_name IS NOT NULL THEN 1
                WHEN uc.phone_book_name IS NOT NULL THEN 2
                WHEN f.status = 'ACCEPTED' THEN 3
                WHEN f.status = 'PENDING' THEN 4
                ELSE 5
              END) = $${baseIdx}::int
              AND LOWER(unaccent(COALESCE(uc.alias_name, uc.phone_book_name, u.display_name))) > $${baseIdx + 1}::text
            )
            OR (
              (CASE
                WHEN uc.alias_name IS NOT NULL THEN 1
                WHEN uc.phone_book_name IS NOT NULL THEN 2
                WHEN f.status = 'ACCEPTED' THEN 3
                WHEN f.status = 'PENDING' THEN 4
                ELSE 5
              END) = $${baseIdx}::int
              AND LOWER(unaccent(COALESCE(uc.alias_name, uc.phone_book_name, u.display_name))) = $${baseIdx + 1}::text
              AND u.id > $${baseIdx + 2}::uuid
            )
          )
        `;
        cursorParams.push(payload.relevanceScore, payload.sortName, payload.lastId as unknown as string);
      }
    }

    // Build exclude clause using parameterized array
    const excludeClause =
      excludeIds.length > 0 ? `AND u.id != ALL($4::uuid[])` : '';

    const params: Array<string | number | string[]> = [
      searcherId,
      keyword,
      normalizedLimit + 1, // Fetch limit+1 to detect hasNextPage
    ];
    if (excludeIds.length > 0) {
      params.push(excludeIds);
    }
    // Add cursor params
    params.push(...cursorParams);

    const query = `
      SELECT DISTINCT
        u.id,
        u.phone_number,
        u.display_name,
        u.avatar_url,
        -- 3-level alias resolution: alias > phoneBookName > displayName
        COALESCE(uc.alias_name, uc.phone_book_name, u.display_name) as display_name_final,
        -- Phone-book name from sync
        uc.phone_book_name,
        -- Contact source (PHONE_SYNC / MANUAL)
        uc.source,
        -- Priority scoring for relevance (S8: phone_book_name = 2)
        CASE 
          WHEN uc.alias_name IS NOT NULL THEN 1::int      -- Alias exists (highest priority)
          WHEN uc.phone_book_name IS NOT NULL THEN 2::int  -- Phone-book name (high priority)
          WHEN f.status = 'ACCEPTED' THEN 3::int           -- Friend
          WHEN f.status = 'PENDING' THEN 4::int            -- Request pending
          ELSE 5::int                                      -- No relationship (lowest)
        END as relevance_score,
        -- Relationship status
        CASE 
          WHEN EXISTS(
            SELECT 1 FROM blocks 
            WHERE (blocker_id = $1::uuid AND blocked_id = u.id)
               OR (blocker_id = u.id AND blocked_id = $1::uuid)
          ) THEN 'BLOCKED'
          WHEN f.status = 'ACCEPTED' THEN 'FRIEND'
          WHEN f.status = 'PENDING' THEN 'REQUEST'
          ELSE 'NONE'
        END as relationship_status,
        -- Friendship context for pending requests
        f.id as friendship_id,
        f.requester_id,
        -- Check if alias or phone-book name exists
        CASE WHEN uc.alias_name IS NOT NULL OR uc.phone_book_name IS NOT NULL THEN true ELSE false END as has_alias,
        -- Existing DIRECT conversation ID (null if never messaged)
        (
          SELECT c.id
          FROM conversations c
          INNER JOIN conversation_members cm1 ON cm1.conversation_id = c.id
          INNER JOIN conversation_members cm2 ON cm2.conversation_id = c.id
          WHERE c.type = 'DIRECT'
            AND cm1.user_id = $1::uuid AND cm1.status = 'ACTIVE'
            AND cm2.user_id = u.id AND cm2.status = 'ACTIVE'
          LIMIT 1
        ) as existing_conversation_id,
        -- Sort key (must be in SELECT for DISTINCT + ORDER BY)
        LOWER(unaccent(COALESCE(uc.alias_name, uc.phone_book_name, u.display_name))) as sort_name
      FROM users u
      -- Optional alias lookup
      LEFT JOIN user_contacts uc 
        ON uc.owner_id = $1::uuid AND uc.contact_user_id = u.id
      -- Friendship lookup (need to handle both orders, exclude soft-deleted)
      LEFT JOIN friendships f ON 
        ((f.user1_id = $1::uuid AND f.user2_id = u.id) 
        OR (f.user1_id = u.id AND f.user2_id = $1::uuid))
        AND f.deleted_at IS NULL
      WHERE 
        -- Searcher is looking for other users
        u.id != $1::uuid
        -- Target user is active
        AND u.status = 'ACTIVE'
        -- Exclude specified IDs
        ${excludeClause}
        -- Cursor pagination
        ${cursorClause}
        -- Block check: exclude if either blocks the other
        AND NOT EXISTS (
          SELECT 1 FROM blocks 
          WHERE (blocker_id = $1::uuid AND blocked_id = u.id)
             OR (blocker_id = u.id AND blocked_id = $1::uuid)
        )
        -- Keyword matching with privacy rules:
        -- 1) Phone search: ONLY exact 10-digit match (Vietnam standard)
        --    → applies to ALL users (friends, contacts, strangers)
        -- 2) Name search: ONLY for friends & contacts (NOT strangers)
        AND (
          -- Branch A: Phone number match
          -- Case 1: 10 digits starting with 0 (e.g. "0901234567")
          -- Case 2: +84 + 9 digits (e.g. "+84901234567")
          (
            (
              length(regexp_replace($2::text, '[^0-9]', '', 'g')) = 10
              AND regexp_replace($2::text, '[^0-9]', '', 'g') ~ '^0[0-9]{9}$'
              AND (
                u.phone_number = regexp_replace($2::text, '[^0-9]', '', 'g')
                OR u.phone_number_normalized = regexp_replace($2::text, '[^0-9]', '', 'g')
                OR u.phone_number_normalized = concat(
                  '+84',
                  substring(regexp_replace($2::text, '[^0-9]', '', 'g') from 2)
                )
              )
            )
            OR
            (
              length(regexp_replace($2::text, '[^0-9]', '', 'g')) = 11
              AND regexp_replace($2::text, '[^0-9]', '', 'g') ~ '^84[0-9]{9}$'
              AND (
                u.phone_number_normalized = concat(
                  '+',
                  regexp_replace($2::text, '[^0-9]', '', 'g')
                )
                OR u.phone_number_normalized = regexp_replace($2::text, '[^0-9]', '', 'g')
                OR u.phone_number = concat(
                  '0',
                  substring(regexp_replace($2::text, '[^0-9]', '', 'g') from 3)
                )
              )
            )
          )
          -- Branch B: Name search — restricted to friends & contacts only
          OR (
            -- Must be a friend or contact to be found by name
            (f.status = 'ACCEPTED' OR uc.contact_user_id IS NOT NULL)
            AND (
              -- Match alias name, phone-book name, or display name (substring)
              LOWER(unaccent(COALESCE(uc.alias_name, uc.phone_book_name, u.display_name))) 
                LIKE LOWER(unaccent(concat('%', $2::text, '%')))
              -- Also match phone_book_name directly (may differ from COALESCE result when alias exists)
              OR LOWER(unaccent(uc.phone_book_name)) 
                LIKE LOWER(unaccent(concat('%', $2::text, '%')))
              -- Trigram matching for fuzzy search (Vietnamese accents)
              OR COALESCE(uc.alias_name, uc.phone_book_name, u.display_name) % $2::text
              -- Starts with keyword (for quick lookups)
              OR LOWER(unaccent(COALESCE(uc.alias_name, uc.phone_book_name, u.display_name))) 
                LIKE LOWER(unaccent(concat($2::text, '%')))
            )
          )
        )
      ORDER BY 
        relevance_score ASC,          -- Alias first, then friends, then requests, then none
        sort_name ASC                  -- Alphabetical (uses SELECT alias for DISTINCT compatibility)
      LIMIT $3::int
    `;

    const results = await this.prisma.$queryRawUnsafe(query, ...params);

    return results as RawContactSearchResult[];
  }

  /**
   * Get contact details including privacy settings
   */
  async getContactDetails(userId: string, targetId: string) {
    const contact = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        phoneNumber: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        createdAt: true,
        privacySettings: {
          select: {
            showProfile: true,
            whoCanMessageMe: true,
            showOnlineStatus: true,
            showLastSeen: true,
          },
        },
        myContacts: {
          where: { ownerId: userId },
          select: { aliasName: true, phoneBookName: true, source: true },
          take: 1,
        },
      },
    });

    return contact;
  }

  /**
   * Search contacts by alias name or phone-book name
   * Used for quick contact lookup by saved names
   * Uses parameterized queries for security
   */
  async searchByContactName(
    searcherId: string,
    keyword: string,
    limit = 50,
  ): Promise<RawContactNameSearchResult[]> {
    const normalizedLimit = PaginationUtil.normalizeLimit(limit, 100);

    const query = `
      SELECT DISTINCT
        u.id,
        u.phone_number,
        u.display_name,
        u.avatar_url,
        COALESCE(uc.alias_name, uc.phone_book_name, u.display_name) as display_name_final,
        uc.phone_book_name,
        uc.source,
        CASE 
          WHEN uc.alias_name IS NOT NULL THEN true 
          WHEN uc.phone_book_name IS NOT NULL THEN true
          ELSE false 
        END as has_alias,
        LOWER(unaccent(COALESCE(uc.alias_name, uc.phone_book_name, u.display_name))) as sort_name
      FROM users u
      JOIN user_contacts uc 
        ON u.id = uc.contact_user_id AND uc.owner_id = $1::uuid
      WHERE 
        (
          LOWER(unaccent(uc.alias_name)) LIKE LOWER(unaccent(concat('%', $2::text, '%')))
          OR LOWER(unaccent(uc.phone_book_name)) LIKE LOWER(unaccent(concat('%', $2::text, '%')))
        )
        AND u.status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM blocks 
          WHERE (blocker_id = $1::uuid AND blocked_id = u.id)
             OR (blocker_id = u.id AND blocked_id = $1::uuid)
        )
      ORDER BY sort_name ASC
      LIMIT $3::int
    `;

    const results = await this.prisma.$queryRawUnsafe(
      query,
      searcherId,
      keyword,
      normalizedLimit,
    );

    return results as RawContactNameSearchResult[];
  }

  /**
   * Get user's contact list
   */
  async getUserContacts(userId: string, limit = 50, offset = 0) {
    const contacts = await this.prisma.userContact.findMany({
      where: { ownerId: userId },
      include: {
        contactUser: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            phoneNumber: true,
            status: true,
          },
        },
      },
      orderBy: [{ aliasName: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    });

    return contacts.map((contact) => ({
      id: contact.contactUser.id,
      phoneNumber: contact.contactUser.phoneNumber,
      displayName: contact.aliasName || contact.phoneBookName || contact.contactUser.displayName,
      avatarUrl: contact.contactUser.avatarUrl,
      status: contact.contactUser.status,
      hasAlias: !!(contact.aliasName || contact.phoneBookName),
      phoneBookName: contact.phoneBookName,
      source: contact.source,
    }));
  }

  /**
   * Map raw results to ContactSearchResultDto.
   * Accepts heterogeneous shapes: raw SQL (snake_case) and Prisma (camelCase).
   * Uses Record<string, unknown> to safely handle both shapes without `any`.
   *
   * Privacy enforcement: If target user's showProfile = 'CONTACTS' and
   * the relationship is not 'FRIEND', sensitive fields are omitted.
   */
  mapToDto(
    rawContacts: Record<string, unknown>[],
    viewerId: string,
    canMessage = false,
  ): ContactSearchResultDto[] {
    return rawContacts.map((contact) => {
      const relationshipStatus = ((contact.relationship_status as string) ||
        (contact.relationshipStatus as string) ||
        'NONE') as 'FRIEND' | 'REQUEST' | 'NONE' | 'BLOCKED';

      const showProfile =
        ((contact.showProfile as string | undefined) ??
          ((contact.privacySettings as { showProfile?: string } | undefined)
            ?.showProfile)) ?? 'CONTACTS';

      const isFriend = relationshipStatus === 'FRIEND';
      const effectiveCanMessage =
        (contact.canMessage as boolean | undefined) ?? canMessage ?? false;
      const isPrivacyLimited =
        showProfile === 'CONTACTS' && !isFriend;

      const requesterId =
        (contact.requester_id ?? contact.requesterId) as string | undefined;
      const pendingRequestId =
        (contact.friendship_id ?? contact.friendshipId) as string | undefined;

      const requestDirection =
        relationshipStatus === 'REQUEST' && requesterId
          ? requesterId === viewerId
            ? 'OUTGOING'
            : 'INCOMING'
          : undefined;

      return {
        id: contact.id as string,
        phoneNumber:
          (contact.phone_number ?? contact.phoneNumber) as string | undefined,
        displayName: (contact.display_name ?? contact.displayName) as string,
        displayNameFinal:
          ((contact.display_name_final ??
            contact.displayNameFinal ??
            contact.display_name ??
            contact.displayName) as string) || '',
        avatarUrl:
          ((contact.avatar_url ?? contact.avatarUrl) as string | null) ??
          undefined,
        phoneBookName:
          ((contact.phone_book_name ?? contact.phoneBookName) as string | null) ??
          undefined,
        source:
          ((contact.source) as 'PHONE_SYNC' | 'MANUAL' | null) ??
          undefined,
        relationshipStatus,
        hasAlias: (contact.has_alias ?? contact.hasAlias ?? false) as boolean,
        aliasPriority: (contact.relevance_score as number) || 5,
        isBlocked: relationshipStatus === 'BLOCKED',
        canMessage: effectiveCanMessage,
        isOnline: contact.isOnline as boolean | undefined,
        lastSeenAt: contact.lastSeenAt as Date | undefined,
        isPrivacyLimited,
        existingConversationId:
          ((contact.existing_conversation_id ??
            contact.existingConversationId) as string | null) ?? undefined,
        pendingRequestId,
        requestDirection,
      };
    });
  }
}
