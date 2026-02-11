import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { PaginationUtil } from '../utils/pagination.util';
import type { RawGroupSearchResult } from '../interfaces/search-raw-result.interface';

/**
 * Group Search Repository (B1)
 * Handles database queries for group/conversation searching
 * Uses pg_trgm + ILIKE for fuzzy matching on conversation names
 */
@Injectable()
export class GroupSearchRepository {
  constructor(private readonly prisma: PrismaService) { }

  /**
   * Search GROUP conversations by name
   *
   * Scope: Only returns groups where the user is an ACTIVE member
   * Matching: ILIKE + pg_trgm fuzzy (handles Vietnamese accents via unaccent)
   * Ordering: Exact prefix matches first, then by last activity
   *
   * Uses parameterized queries to prevent SQL injection
   */
  async searchGroups(
    userId: string,
    keyword: string,
    limit = 50,
    cursor?: string,
  ): Promise<RawGroupSearchResult[]> {
    const normalizedLimit = PaginationUtil.normalizeLimit(limit, 200);

    // Decode cursor: { prefixMatch, lastMessageAt, lastId }
    let cursorClause = '';
    const cursorParams: (string | number)[] = [];
    if (cursor) {
      const decoded = PaginationUtil.decodeCursor(cursor);
      if (decoded) {
        const payload = decoded as unknown as {
          prefixMatch: number;
          lastMessageAt: string;
          lastId: string;
        };
        cursorClause = `
          AND (
            (CASE WHEN LOWER(unaccent(c.name)) LIKE LOWER(unaccent(concat($2::text, '%'))) THEN 0 ELSE 1 END) > $4::int
            OR (
              (CASE WHEN LOWER(unaccent(c.name)) LIKE LOWER(unaccent(concat($2::text, '%'))) THEN 0 ELSE 1 END) = $4::int
              AND (c.last_message_at < $5::timestamptz OR c.last_message_at IS NULL)
            )
            OR (
              (CASE WHEN LOWER(unaccent(c.name)) LIKE LOWER(unaccent(concat($2::text, '%'))) THEN 0 ELSE 1 END) = $4::int
              AND c.last_message_at = $5::timestamptz
              AND c.id > $6::uuid
            )
          )
        `;
        cursorParams.push(payload.prefixMatch, payload.lastMessageAt, payload.lastId);
      }
    }

    const params: (string | number | string[])[] = [
      userId,
      keyword,
      normalizedLimit + 1, // Fetch limit+1 to detect hasNextPage
      ...cursorParams,
    ];

    const query = `
      SELECT
        c.id,
        c.name,
        c.avatar_url,
        c.last_message_at,
        (
          SELECT COUNT(*)::int
          FROM conversation_members cm_count
          WHERE cm_count.conversation_id = c.id AND cm_count.status = 'ACTIVE'
        ) AS member_count,
        COALESCE(
          (SELECT json_agg(sub.display_name)
           FROM (
             SELECT u2.display_name
             FROM conversation_members cm_preview
             JOIN users u2 ON u2.id = cm_preview.user_id
             WHERE cm_preview.conversation_id = c.id
               AND cm_preview.status = 'ACTIVE'
               AND cm_preview.user_id != $1::uuid
             ORDER BY u2.display_name
             LIMIT 3
           ) sub
          ),
          '[]'::json
        ) AS members_preview,
        true AS is_user_member,
        CASE WHEN LOWER(unaccent(c.name)) LIKE LOWER(unaccent(concat($2::text, '%'))) THEN 0 ELSE 1 END AS prefix_match
      FROM conversations c
      WHERE
        c.type = 'GROUP'
        AND c.deleted_at IS NULL
        AND c.name IS NOT NULL
        -- User must be an ACTIVE member
        AND EXISTS (
          SELECT 1 FROM conversation_members cm
          WHERE cm.conversation_id = c.id
            AND cm.user_id = $1::uuid
            AND cm.status = 'ACTIVE'
        )
        -- Keyword matching: ILIKE (accent-insensitive) + pg_trgm fuzzy
        AND (
          LOWER(unaccent(c.name)) LIKE LOWER(unaccent(concat('%', $2::text, '%')))
          OR c.name % $2::text
        )
        ${cursorClause}
      ORDER BY
        prefix_match,
        c.last_message_at DESC NULLS LAST,
        c.id ASC
      LIMIT $3::int
    `;

    const results = await this.prisma.$queryRawUnsafe(
      query,
      ...params,
    );

    return results as RawGroupSearchResult[];
  }
}
