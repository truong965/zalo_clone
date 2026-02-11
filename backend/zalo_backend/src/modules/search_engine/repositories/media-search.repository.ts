import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { PaginationUtil } from '../utils/pagination.util';
import type {
  RawMediaSearchResult,
  RawMediaGroupedResult,
} from '../interfaces/search-raw-result.interface';

/**
 * Media Search Repository (B2)
 * Handles database queries for media attachment searching
 * Searches by original_name using pg_trgm + ILIKE
 */
@Injectable()
export class MediaSearchRepository {
  constructor(private readonly prisma: PrismaService) { }

  /**
   * Search media attachments by filename
   *
   * Scope: Only returns media in conversations where user is ACTIVE member
   * Matching: ILIKE + pg_trgm on original_name (handles Vietnamese accents via unaccent)
   * Joins: media_attachments → messages → conversations
   *
   * Uses parameterized queries to prevent SQL injection
   */
  async searchMedia(
    userId: string,
    keyword: string,
    conversationIds: string[],
    limit = 50,
    mediaType?: string,
    cursor?: string,
  ): Promise<RawMediaSearchResult[]> {
    const normalizedLimit = PaginationUtil.normalizeLimit(limit, 200);

    // Build media type filter conditionally
    const mediaTypeClause = mediaType
      ? `AND ma.media_type = $4::media_type`
      : '';

    // Decode cursor: { lastCreatedAt, lastId }
    let cursorClause = '';
    const cursorParams: string[] = [];
    const baseIdx = mediaType ? 5 : 4;
    if (cursor) {
      const decoded = PaginationUtil.decodeCursor(cursor);
      if (decoded) {
        cursorClause = `
          AND (
            ma.created_at < $${baseIdx}::timestamptz
            OR (ma.created_at = $${baseIdx}::timestamptz AND ma.id < $${baseIdx + 1}::uuid)
          )
        `;
        cursorParams.push(decoded.lastCreatedAt, decoded.lastId as string);
      }
    }

    const params: (string | number | string[])[] = [
      keyword,
      conversationIds,
      normalizedLimit + 1, // Fetch limit+1 to detect hasNextPage
    ];

    if (mediaType) {
      params.push(mediaType);
    }
    params.push(...cursorParams);

    const query = `
      SELECT
        ma.id,
        ma.message_id,
        ma.original_name,
        ma.media_type,
        ma.mime_type,
        ma.size,
        ma.thumbnail_url,
        ma.cdn_url,
        ma.uploaded_by,
        COALESCE(u.display_name, 'Unknown') AS uploaded_by_name,
        m.conversation_id,
        conv.name AS conversation_name,
        ma.created_at
      FROM media_attachments ma
      JOIN messages m ON m.id = ma.message_id
      JOIN conversations conv ON conv.id = m.conversation_id
      LEFT JOIN users u ON u.id = ma.uploaded_by
      WHERE
        ma.deleted_at IS NULL
        AND m.deleted_at IS NULL
        -- Scope: user's active conversations only
        AND m.conversation_id = ANY($2::uuid[])
        ${mediaTypeClause}
        -- Keyword matching on file name
        AND (
          LOWER(unaccent(ma.original_name)) LIKE LOWER(unaccent(concat('%', $1::text, '%')))
          OR ma.original_name % $1::text
        )
        ${cursorClause}
      ORDER BY ma.created_at DESC, ma.id DESC
      LIMIT $3::int
    `;

    const results = await this.prisma.$queryRawUnsafe(query, ...params);

    return results as RawMediaSearchResult[];
  }

  /**
   * Search media grouped by conversation.
   * Returns one row per conversation with match count + latest match.
   */
  async searchMediaGroupedByConversation(
    keyword: string,
    conversationIds: string[],
    limit = 50,
  ): Promise<RawMediaGroupedResult[]> {
    const normalizedLimit = PaginationUtil.normalizeLimit(limit, 200);

    const query = `
      WITH matched_media AS (
        SELECT
          ma.id,
          ma.original_name,
          ma.media_type,
          ma.mime_type,
          ma.size,
          ma.thumbnail_url,
          ma.cdn_url,
          ma.created_at,
          m.conversation_id,
          COALESCE(u.display_name, 'Unknown') AS uploaded_by_name,
          ROW_NUMBER() OVER (PARTITION BY m.conversation_id ORDER BY ma.created_at DESC) AS rn
        FROM media_attachments ma
        JOIN messages m ON m.id = ma.message_id
        LEFT JOIN users u ON u.id = ma.uploaded_by
        WHERE ma.deleted_at IS NULL AND m.deleted_at IS NULL
          AND m.conversation_id = ANY($2::uuid[])
          AND (
            LOWER(unaccent(ma.original_name)) LIKE LOWER(unaccent(concat('%', $1::text, '%')))
            OR ma.original_name % $1::text
          )
      ),
      conversation_stats AS (
        SELECT
          conversation_id,
          COUNT(*)::int AS match_count
        FROM matched_media
        GROUP BY conversation_id
      )
      SELECT
        cs.conversation_id,
        c.name AS conversation_name,
        c.type AS conversation_type,
        c.avatar_url AS conversation_avatar,
        cs.match_count,
        mm.id AS latest_media_id,
        mm.original_name,
        mm.media_type,
        mm.mime_type,
        mm.size,
        mm.thumbnail_url,
        mm.cdn_url,
        mm.uploaded_by_name,
        mm.created_at AS latest_created_at
      FROM conversation_stats cs
      JOIN conversations c ON c.id = cs.conversation_id
      JOIN matched_media mm ON mm.conversation_id = cs.conversation_id AND mm.rn = 1
      ORDER BY cs.match_count DESC, mm.created_at DESC
      LIMIT $3::int
    `;

    const results = await this.prisma.$queryRawUnsafe(
      query,
      keyword,
      conversationIds,
      normalizedLimit,
    );

    return results as RawMediaGroupedResult[];
  }
}
