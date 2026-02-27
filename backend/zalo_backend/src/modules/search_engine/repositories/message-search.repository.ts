import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { MessageType } from '@prisma/client';
import { MessageSearchResultDto, ConversationGroupedMessageDto } from '../dto/search.dto';
import { PaginationUtil } from '../utils/pagination.util';
import { RankingUtil, RelationshipType } from '../utils/ranking.util';
import type {
  RawMessageBaseResult,
  RawMessageSearchResult,
  RawMessageContextResult,
  MessageContextResult,
  RawGroupedMessageResult,
} from '../interfaces/search-raw-result.interface';

/**
 * Message Search Repository
 * Handles all database queries for message searching
 */

@Injectable()
export class MessageSearchRepository {
  constructor(private prisma: PrismaService) { }

  /**
   * Search messages in a specific conversation
   * Supports full-text search, trigram search, and filtering
   * Uses parameterized queries to prevent SQL injection
   *
   * Phase 4: Added hasMedia filter
   */
  async searchInConversation(
    userId: string,
    conversationId: string,
    keyword: string,
    limit = 50,
    cursor?: string,
    messageType?: MessageType,
    fromUserId?: string,
    startDate?: Date,
    endDate?: Date,
    hasMedia?: boolean,
  ): Promise<any[]> {
    const decodedCursor = cursor ? PaginationUtil.decodeCursor(cursor) : null;
    const normalizedLimit = PaginationUtil.normalizeLimit(limit, 100);

    // Build parameter array
    const params: any[] = [
      keyword,
      normalizedLimit + 1,
      userId,
      conversationId,
    ];
    let paramIndex = 5;

    // Build dynamic WHERE conditions
    const dynamicConditions: string[] = [];

    // Message type filter
    if (messageType) {
      dynamicConditions.push(`m.type = $${paramIndex}::message_type`);
      params.push(messageType);
      paramIndex++;
    }

    // From specific user
    if (fromUserId) {
      dynamicConditions.push(`m.sender_id = $${paramIndex}::uuid`);
      params.push(fromUserId);
      paramIndex++;
    }

    // Date range
    if (startDate) {
      dynamicConditions.push(`m.created_at >= $${paramIndex}::timestamptz`);
      params.push(startDate.toISOString());
      paramIndex++;
    }
    if (endDate) {
      dynamicConditions.push(`m.created_at <= $${paramIndex}::timestamptz`);
      params.push(endDate.toISOString());
      paramIndex++;
    }

    // Phase 4: hasMedia filter (check if message has media attachments)
    if (hasMedia !== undefined) {
      if (hasMedia) {
        dynamicConditions.push(`EXISTS (
          SELECT 1 FROM media_attachments ma 
          WHERE ma.message_id = m.id 
          AND ma.deleted_at IS NULL
        )`);
      } else {
        dynamicConditions.push(`NOT EXISTS (
          SELECT 1 FROM media_attachments ma 
          WHERE ma.message_id = m.id 
          AND ma.deleted_at IS NULL
        )`);
      }
    }

    // Cursor pagination
    let cursorCondition = '';
    if (decodedCursor) {
      cursorCondition = `
        AND (m.created_at < $${paramIndex}::timestamptz 
             OR (m.created_at = $${paramIndex}::timestamptz AND m.id < $${paramIndex + 1}::bigint))
      `;
      params.push(decodedCursor.lastCreatedAt, decodedCursor.lastId);
      paramIndex += 2;
    }

    const additionalConditions =
      dynamicConditions.length > 0
        ? 'AND ' + dynamicConditions.join(' AND ')
        : '';

    // FIX: Đổi StartSel/StopSel sang ký tự placeholder không thể xuất hiện trong
    // content thực tế. ts_headline trả về HTML string nên dùng <mark> trực tiếp
    // sẽ bị frontend parse nhầm thành HTML tag thật, sau đó getHighlightSegments()
    // dùng highlights[] (positions từ extractHighlights) để đánh dấu lần 2 → double highlight.
    // Giải pháp: dùng placeholder đặc biệt ([[HL]] / [[/HL]]) ở DB, strip/parse ở backend
    // trước khi trả về frontend. Frontend chỉ nhận preview text thuần + highlights[].
    const query = `
      SELECT 
        m.id,
        m.conversation_id,
        m.sender_id,
        COALESCE(uc.alias_name, uc.phone_book_name, u.display_name) as sender_name,
        u.avatar_url as sender_avatar_url,
        c.type as conversation_type,
        c.name as conversation_name,
        m.type,
        m.content,
        m.created_at,
        -- FIX: Dùng placeholder thay vì <mark> HTML trực tiếp
        -- FIX-VIET: 'simple' config (no stemming) + phraseto_tsquery (adjacent tokens) for Vietnamese phrase matching
        ts_headline(
          'simple',
          COALESCE(unaccent(m.content), ''),
          phraseto_tsquery('simple', unaccent($1::text)),
          'StartSel=[[HL]], StopSel=[[/HL]], MaxWords=15, MinWords=5, HighlightAll=false'
        ) as preview_snippet,
        ts_rank(m.search_vector, phraseto_tsquery('simple', unaccent($1::text))) as rank_score,
        (SELECT COUNT(*) FROM messages WHERE reply_to_message_id = m.id AND deleted_at IS NULL) as reply_count,
        m.seen_count as seen_count
      FROM messages m
      JOIN conversation_members cm 
        ON m.conversation_id = cm.conversation_id
      JOIN conversations c ON m.conversation_id = c.id
      LEFT JOIN users u ON m.sender_id = u.id
      LEFT JOIN user_contacts uc ON uc.owner_id = $3::uuid AND uc.contact_user_id = m.sender_id
      WHERE m.conversation_id = $4::uuid
        AND m.deleted_at IS NULL
        AND cm.user_id = $3::uuid 
        AND cm.status = 'ACTIVE'
        AND (
          m.search_vector @@ phraseto_tsquery('simple', unaccent($1::text))
          OR unaccent(m.content) ILIKE unaccent(concat('%', $1::text, '%'))
        )
        ${additionalConditions}
        ${cursorCondition}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $2::int
    `;

    const results = await this.prisma.$queryRawUnsafe(query, ...params);

    return results as RawMessageSearchResult[];
  }

  /**
   * Browse messages in a conversation by filters only (no keyword / full-text search).
   * Used when messageType filter is active but keyword is empty.
   * Returns messages matching filter criteria, ordered by created_at DESC.
   */
  async browseInConversation(
    userId: string,
    conversationId: string,
    limit = 50,
    cursor?: string,
    messageType?: MessageType,
    fromUserId?: string,
    startDate?: Date,
    endDate?: Date,
    hasMedia?: boolean,
  ): Promise<any[]> {
    const decodedCursor = cursor ? PaginationUtil.decodeCursor(cursor) : null;
    const normalizedLimit = PaginationUtil.normalizeLimit(limit, 100);

    // Parameters: $1 = userId, $2 = conversationId, $3 = limit+1
    const params: any[] = [userId, conversationId, normalizedLimit + 1];
    let paramIndex = 4;

    const dynamicConditions: string[] = [];

    if (messageType) {
      dynamicConditions.push(`m.type = $${paramIndex}::message_type`);
      params.push(messageType);
      paramIndex++;
    }
    if (fromUserId) {
      dynamicConditions.push(`m.sender_id = $${paramIndex}::uuid`);
      params.push(fromUserId);
      paramIndex++;
    }
    if (startDate) {
      dynamicConditions.push(`m.created_at >= $${paramIndex}::timestamptz`);
      params.push(startDate.toISOString());
      paramIndex++;
    }
    if (endDate) {
      dynamicConditions.push(`m.created_at <= $${paramIndex}::timestamptz`);
      params.push(endDate.toISOString());
      paramIndex++;
    }
    if (hasMedia !== undefined) {
      if (hasMedia) {
        dynamicConditions.push(`EXISTS (
          SELECT 1 FROM media_attachments ma
          WHERE ma.message_id = m.id AND ma.deleted_at IS NULL
        )`);
      } else {
        dynamicConditions.push(`NOT EXISTS (
          SELECT 1 FROM media_attachments ma
          WHERE ma.message_id = m.id AND ma.deleted_at IS NULL
        )`);
      }
    }

    let cursorCondition = '';
    if (decodedCursor) {
      cursorCondition = `
        AND (m.created_at < $${paramIndex}::timestamptz
             OR (m.created_at = $${paramIndex}::timestamptz AND m.id < $${paramIndex + 1}::bigint))
      `;
      params.push(decodedCursor.lastCreatedAt, decodedCursor.lastId);
      paramIndex += 2;
    }

    const additionalConditions =
      dynamicConditions.length > 0
        ? 'AND ' + dynamicConditions.join(' AND ')
        : '';

    const query = `
      SELECT
        m.id,
        m.conversation_id,
        m.sender_id,
        COALESCE(uc.alias_name, uc.phone_book_name, u.display_name) as sender_name,
        u.avatar_url as sender_avatar_url,
        c.type as conversation_type,
        c.name as conversation_name,
        m.type,
        m.content,
        m.created_at,
        SUBSTRING(COALESCE(m.content, ''), 1, 80) as preview_snippet,
        0 as rank_score,
        (SELECT COUNT(*) FROM messages WHERE reply_to_message_id = m.id AND deleted_at IS NULL) as reply_count,
        m.seen_count as seen_count
      FROM messages m
      JOIN conversation_members cm ON m.conversation_id = cm.conversation_id
      JOIN conversations c ON m.conversation_id = c.id
      LEFT JOIN users u ON m.sender_id = u.id
      LEFT JOIN user_contacts uc ON uc.owner_id = $1::uuid AND uc.contact_user_id = m.sender_id
      WHERE m.conversation_id = $2::uuid
        AND m.deleted_at IS NULL
        AND cm.user_id = $1::uuid
        AND cm.status = 'ACTIVE'
        ${additionalConditions}
        ${cursorCondition}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $3::int
    `;

    const results = await this.prisma.$queryRawUnsafe(query, ...params);
    return results as RawMessageSearchResult[];
  }

  /**
   * Get messages around a target message ID (context loading)
   * Returns target + before + after messages
   */
  async getMessageContext(
    userId: string,
    conversationId: string,
    targetMessageId: bigint,
    before = 10,
    after = 10,
  ): Promise<MessageContextResult> {
    const membership = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      select: { status: true },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new Error('No access to this conversation');
    }

    const targetMessage = await this.prisma.message.findUnique({
      where: { id: targetMessageId },
      select: { conversationId: true, deletedAt: true },
    });

    if (!targetMessage || targetMessage.deletedAt !== null) {
      throw new Error('Message not found');
    }

    if (targetMessage.conversationId !== conversationId) {
      throw new Error('Message not in this conversation');
    }

    const targetMsg = await this.prisma.message.findUnique({
      where: { id: targetMessageId },
      select: { createdAt: true },
    });

    if (!targetMsg) {
      throw new Error('Message not found');
    }

    const beforeQuery = `
      SELECT 
        m.id,
        m.conversation_id,
        m.sender_id,
        COALESCE(uc.alias_name, uc.phone_book_name, u.display_name) as sender_name,
        u.avatar_url as sender_avatar_url,
        c.type as conversation_type,
        c.name as conversation_name,
        m.type,
        m.content,
        m.created_at,
        false as is_target
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      LEFT JOIN users u ON m.sender_id = u.id
      LEFT JOIN user_contacts uc ON uc.owner_id = $5::uuid AND uc.contact_user_id = m.sender_id
      WHERE m.conversation_id = $1::uuid
        AND m.deleted_at IS NULL
        AND (m.created_at < $2::timestamptz OR (m.created_at = $2::timestamptz AND m.id < $3::bigint))
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $4::int
    `;

    const afterQuery = `
      SELECT 
        m.id,
        m.conversation_id,
        m.sender_id,
        COALESCE(uc.alias_name, uc.phone_book_name, u.display_name) as sender_name,
        u.avatar_url as sender_avatar_url,
        c.type as conversation_type,
        c.name as conversation_name,
        m.type,
        m.content,
        m.created_at,
        false as is_target
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      LEFT JOIN users u ON m.sender_id = u.id
      LEFT JOIN user_contacts uc ON uc.owner_id = $5::uuid AND uc.contact_user_id = m.sender_id
      WHERE m.conversation_id = $1::uuid
        AND m.deleted_at IS NULL
        AND (m.created_at > $2::timestamptz OR (m.created_at = $2::timestamptz AND m.id > $3::bigint))
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT $4::int
    `;

    const targetQuery = `
      SELECT 
        m.id,
        m.conversation_id,
        m.sender_id,
        COALESCE(uc.alias_name, uc.phone_book_name, u.display_name) as sender_name,
        u.avatar_url as sender_avatar_url,
        c.type as conversation_type,
        c.name as conversation_name,
        m.type,
        m.content,
        m.created_at,
        true as is_target
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      LEFT JOIN users u ON m.sender_id = u.id
      LEFT JOIN user_contacts uc ON uc.owner_id = $3::uuid AND uc.contact_user_id = m.sender_id
      WHERE m.id = $1::bigint AND m.conversation_id = $2::uuid AND m.deleted_at IS NULL
    `;

    const [beforeMessages, afterMessages, targetMessages] = await Promise.all([
      this.prisma.$queryRawUnsafe<RawMessageContextResult[]>(
        beforeQuery,
        conversationId,
        targetMsg.createdAt.toISOString(),
        targetMessageId,
        before,
        userId,
      ),
      this.prisma.$queryRawUnsafe<RawMessageContextResult[]>(
        afterQuery,
        conversationId,
        targetMsg.createdAt.toISOString(),
        targetMessageId,
        after,
        userId,
      ),
      this.prisma.$queryRawUnsafe<RawMessageContextResult[]>(
        targetQuery,
        targetMessageId,
        conversationId,
        userId,
      ),
    ]);

    const allMessages = [
      ...beforeMessages.reverse(),
      ...targetMessages,
      ...afterMessages,
    ];

    return {
      messages: allMessages,
      targetMessage: allMessages.find((m) => m.is_target),
      totalInRange: allMessages.length,
    };
  }

  /**
   * Search globally across all user's conversations
   */
  async searchGlobal(
    userId: string,
    keyword: string,
    limit = 20,
    conversationIds?: string[],
  ): Promise<RawMessageSearchResult[]> {
    const normalizedLimit = PaginationUtil.normalizeLimit(limit, 50);

    let conversationFilter = '';
    // Always place userId at $3 for user_contacts JOIN
    const params: any[] = [keyword, normalizedLimit, userId];

    if (conversationIds && conversationIds.length > 0) {
      conversationFilter = `AND m.conversation_id = ANY($4::uuid[])`;
      params.push(conversationIds);
    } else {
      conversationFilter = `
        AND m.conversation_id IN (
          SELECT conversation_id 
          FROM conversation_members 
          WHERE user_id = $3::uuid AND status = 'ACTIVE'
        )
      `;
    }

    // FIX: Dùng placeholder [[HL]] / [[/HL]] thay vì <mark> / </mark>
    // FIX-VIET: 'simple' config + phraseto_tsquery for Vietnamese phrase matching
    const query = `
      SELECT 
        m.id,
        m.conversation_id,
        m.sender_id,
        COALESCE(uc.alias_name, uc.phone_book_name, u.display_name) as sender_name,
        u.avatar_url as sender_avatar_url,
        c.type as conversation_type,
        c.name as conversation_name,
        m.type,
        m.content,
        m.created_at,
        -- FIX: Dùng placeholder thay vì <mark> HTML trực tiếp
        ts_headline(
          'simple',
          COALESCE(unaccent(m.content), ''),
          phraseto_tsquery('simple', unaccent($1::text)),
          'StartSel=[[HL]], StopSel=[[/HL]], MaxWords=15, MinWords=5, HighlightAll=false'
        ) as preview_snippet,
        ts_rank(m.search_vector, phraseto_tsquery('simple', unaccent($1::text))) as rank_score,
        (SELECT COUNT(*) FROM messages WHERE reply_to_message_id = m.id AND deleted_at IS NULL) as reply_count,
        m.seen_count as seen_count
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      LEFT JOIN users u ON m.sender_id = u.id
      LEFT JOIN user_contacts uc ON uc.owner_id = $3::uuid AND uc.contact_user_id = m.sender_id
      WHERE m.deleted_at IS NULL
        AND (
          m.search_vector @@ phraseto_tsquery('simple', unaccent($1::text))
          OR unaccent(m.content) ILIKE unaccent(concat('%', $1::text, '%'))
        )
        ${conversationFilter}
      ORDER BY rank_score DESC, m.created_at DESC
      LIMIT $2::int
    `;

    const results = await this.prisma.$queryRawUnsafe(query, ...params);

    return results as RawMessageSearchResult[];
  }

  /**
   * Search globally, grouped by conversation.
   * Returns one row per conversation with match_count and latest matching message.
   *
   * CTE approach:
   * 1. matched_messages: find all matching messages across conversations
   * 2. conversation_stats: GROUP BY conversation_id → count + max created_at
   * 3. Final: DISTINCT ON to get the latest matching message per conversation
   */
  async searchGlobalGroupedByConversation(
    userId: string,
    keyword: string,
    limit = 10,
    conversationIds?: string[],
  ): Promise<RawGroupedMessageResult[]> {
    const normalizedLimit = PaginationUtil.normalizeLimit(limit, 30);

    let conversationFilter = '';
    // Always place userId at $3 for DM name/avatar resolution
    const params: any[] = [keyword, normalizedLimit, userId];

    if (conversationIds && conversationIds.length > 0) {
      conversationFilter = `AND m.conversation_id = ANY($4::uuid[])`;
      params.push(conversationIds);
    } else {
      conversationFilter = `
        AND m.conversation_id IN (
          SELECT conversation_id 
          FROM conversation_members 
          WHERE user_id = $3::uuid AND status = 'ACTIVE'
        )
      `;
    }

    const query = `
      WITH matched_messages AS (
        SELECT
          m.id,
          m.conversation_id,
          m.sender_id,
          COALESCE(uc.alias_name, uc.phone_book_name, u.display_name) as sender_name,
          m.content,
          m.created_at,
          ts_headline(
            'simple',
            COALESCE(unaccent(m.content), ''),
            phraseto_tsquery('simple', unaccent($1::text)),
            'StartSel=[[HL]], StopSel=[[/HL]], MaxWords=15, MinWords=5, HighlightAll=false'
          ) as preview_snippet,
          ts_rank(m.search_vector, phraseto_tsquery('simple', unaccent($1::text))) as rank_score
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        LEFT JOIN user_contacts uc ON uc.owner_id = $3::uuid AND uc.contact_user_id = m.sender_id
        WHERE m.deleted_at IS NULL
          AND (
            m.search_vector @@ phraseto_tsquery('simple', unaccent($1::text))
            OR unaccent(m.content) ILIKE unaccent(concat('%', $1::text, '%'))
          )
          ${conversationFilter}
      ),
      conversation_stats AS (
        SELECT
          conversation_id,
          COUNT(*)::int as match_count,
          MAX(created_at) as latest_created_at
        FROM matched_messages
        GROUP BY conversation_id
      )
      SELECT DISTINCT ON (cs.conversation_id)
        cs.conversation_id,
        CASE
          WHEN c.type = 'DIRECT' THEN (
            SELECT COALESCE(uc2.alias_name, uc2.phone_book_name, u2.display_name)
            FROM conversation_members cm2
            JOIN users u2 ON cm2.user_id = u2.id
            LEFT JOIN user_contacts uc2 ON uc2.owner_id = $3::uuid AND uc2.contact_user_id = u2.id
            WHERE cm2.conversation_id = c.id
              AND cm2.user_id != $3::uuid
              AND cm2.status = 'ACTIVE'
            LIMIT 1
          )
          ELSE c.name
        END as conversation_name,
        c.type as conversation_type,
        CASE
          WHEN c.type = 'DIRECT' THEN (
            SELECT u2.avatar_url
            FROM conversation_members cm2
            JOIN users u2 ON cm2.user_id = u2.id
            WHERE cm2.conversation_id = c.id
              AND cm2.user_id != $3::uuid
              AND cm2.status = 'ACTIVE'
            LIMIT 1
          )
          ELSE c.avatar_url
        END as conversation_avatar,
        cs.match_count,
        mm.id as latest_message_id,
        mm.sender_id,
        mm.sender_name,
        mm.content,
        mm.preview_snippet,
        mm.created_at
      FROM conversation_stats cs
      JOIN conversations c ON cs.conversation_id = c.id
      JOIN matched_messages mm ON mm.conversation_id = cs.conversation_id
        AND mm.created_at = cs.latest_created_at
      ORDER BY cs.conversation_id, mm.rank_score DESC, mm.created_at DESC
      LIMIT $2::int
    `;

    const results = await this.prisma.$queryRawUnsafe(query, ...params);
    return results as RawGroupedMessageResult[];
  }

  /**
   * Map raw grouped results to ConversationGroupedMessageDto[]
   * Reuses parseSnippetPlaceholders / createPreview / extractHighlights for snippet processing
   */
  mapToGroupedDto(
    rawRows: RawGroupedMessageResult[],
    keyword: string,
  ): ConversationGroupedMessageDto[] {
    return rawRows.map((row) => {
      let plainText: string;
      let highlights: Array<{ start: number; end: number; text: string }>;

      if (row.preview_snippet) {
        const parsed = this.parseSnippetPlaceholders(row.preview_snippet);
        if (parsed.highlights.length > 0) {
          plainText = parsed.plainText;
          highlights = parsed.highlights;
        } else {
          plainText = this.createPreview(row.content, keyword);
          highlights = this.extractHighlights(plainText, keyword);
        }
      } else {
        plainText = this.createPreview(row.content, keyword);
        highlights = this.extractHighlights(plainText, keyword);
      }

      return {
        conversationId: row.conversation_id,
        conversationName: row.conversation_name || row.sender_name || 'Người dùng',
        conversationType: row.conversation_type,
        conversationAvatar: row.conversation_avatar ?? undefined,
        matchCount: Number(row.match_count),
        latestMatch: {
          id: row.latest_message_id.toString(),
          senderId: row.sender_id,
          senderName: row.sender_name || 'Unknown',
          preview: plainText,
          highlights,
          createdAt: row.created_at,
        },
      };
    });
  }

  /**
   * Map raw database results to MessageSearchResultDto
   */
  async mapToDto(
    rawMessages: RawMessageBaseResult[],
    searcherId: string,
    keyword: string,
  ): Promise<MessageSearchResultDto[]> {
    if (rawMessages.length === 0) return [];

    const uniqueSenderIds = [
      ...new Set(
        rawMessages
          .map((msg) => msg.sender_id)
          .filter((id) => id !== null && id !== searcherId),
      ),
    ];

    const relationshipMap = await this.batchGetRelationships(
      searcherId,
      uniqueSenderIds,
    );

    return rawMessages.map((msg) => {
      const relationship =
        msg.sender_id && msg.sender_id !== searcherId
          ? relationshipMap.get(msg.sender_id) || RelationshipType.NONE
          : RelationshipType.NONE;

      const searchMsg = msg as Partial<RawMessageSearchResult>;
      const hasReplies = (searchMsg.reply_count || 0) > 0;
      const hasSeenReceipts = (searchMsg.seen_count || 0) > 0;

      // Parse preview_snippet chứa [[HL]] placeholder → trích xuất highlights[]
      // Khi ts_headline trả snippet KHÔNG có [[HL]] (ILIKE match, partial token),
      // fallback sang createPreview + extractHighlights trên plainText (không phải content gốc)
      // để offset chính xác trong đoạn snippet ngắn.
      let plainText: string;
      let highlights: Array<{ start: number; end: number; text: string }>;

      if (searchMsg.preview_snippet) {
        const parsed = this.parseSnippetPlaceholders(searchMsg.preview_snippet);
        if (parsed.highlights.length > 0) {
          // ts_headline matched tokens → use parsed highlights
          plainText = parsed.plainText;
          highlights = parsed.highlights;
        } else {
          // ts_headline returned snippet WITHOUT highlights (ILIKE/partial match)
          // → rebuild snippet around keyword + compute offsets on that snippet
          plainText = this.createPreview(msg.content, keyword);
          highlights = this.extractHighlights(plainText, keyword);
        }
      } else {
        plainText = this.createPreview(msg.content, keyword);
        highlights = this.extractHighlights(msg.content, keyword);
      }

      const fullRankScore = keyword
        ? RankingUtil.calculateFullScore(
          searchMsg.rank_score || 0,
          msg.created_at,
          relationship,
          msg.content,
          keyword,
          hasReplies,
          hasSeenReceipts,
        )
        : 0;

      return {
        id: msg.id.toString(),
        conversationId: msg.conversation_id,
        senderId: msg.sender_id,
        senderName: msg.sender_name || 'Unknown',
        senderAvatarUrl: msg.sender_avatar_url ?? undefined,
        conversationType: msg.conversation_type,
        conversationName: msg.conversation_name || 'Direct Message',
        type: msg.type,
        content: msg.content ?? undefined,
        // FIX: preview là plain text (không có HTML tag), highlights[] đã chính xác
        preview: plainText,
        highlights,
        createdAt: msg.created_at,
        rankScore: fullRankScore,
      };
    });
  }

  /**
   * FIX (THÊM MỚI): Parse preview_snippet từ ts_headline dùng [[HL]] placeholder.
   *
   * Vấn đề cũ:
   *   - ts_headline trả về: "tin nhắn <mark>150</mark> đây"
   *   - Backend gán thẳng vào preview (có HTML) và gọi thêm extractHighlights() → highlights[]
   *   - Frontend nhận preview có sẵn <mark> rồi còn wrap thêm <mark> từ highlights[] nữa
   *   → Kết quả: "<mark><mark>150</mark></mark>" hoặc highlight lệch vị trí
   *
   * Giải pháp:
   *   1. DB trả về placeholder: "tin nhắn [[HL]]150[[/HL]] đây"
   *   2. Hàm này strip placeholder → plainText = "tin nhắn 150 đây"
   *   3. Đồng thời tính offset chính xác từ plainText → highlights[]
   *   4. Frontend chỉ nhận plainText + highlights[], tự render <mark>
   */
  private parseSnippetPlaceholders(snippet: string): {
    plainText: string;
    highlights: Array<{ start: number; end: number; text: string }>;
  } {
    const highlights: Array<{ start: number; end: number; text: string }> = [];
    let plainText = '';
    let currentPos = 0; // vị trí trong plainText đang build

    // Regex tìm [[HL]]...[[/HL]] và phần text bình thường xen kẽ
    const regex = /\[\[HL\]\](.*?)\[\[\/HL\]\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(snippet)) !== null) {
      // Phần text trước highlight này
      const before = snippet.slice(lastIndex, match.index);
      plainText += before;
      currentPos += before.length;

      // Phần text được highlight
      const highlightedText = match[1];
      const start = currentPos;
      const end = currentPos + highlightedText.length;

      highlights.push({ start, end, text: highlightedText });

      plainText += highlightedText;
      currentPos += highlightedText.length;
      lastIndex = regex.lastIndex;
    }

    // Phần text còn lại sau highlight cuối
    plainText += snippet.slice(lastIndex);

    return { plainText, highlights };
  }

  /**
   * Batch fetch relationships for multiple users (PERFORMANCE OPTIMIZATION)
   */
  private async batchGetRelationships(
    userId: string,
    targetUserIds: string[],
  ): Promise<Map<string, RelationshipType>> {
    if (targetUserIds.length === 0) {
      return new Map();
    }

    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          {
            user1Id: userId,
            user2Id: { in: targetUserIds },
          },
          {
            user1Id: { in: targetUserIds },
            user2Id: userId,
          },
        ],
      },
      select: {
        user1Id: true,
        user2Id: true,
        status: true,
      },
    });

    const relationshipMap = new Map<string, RelationshipType>();

    friendships.forEach((f) => {
      const targetId = f.user1Id === userId ? f.user2Id : f.user1Id;

      switch (f.status) {
        case 'ACCEPTED':
          relationshipMap.set(targetId, RelationshipType.FRIEND);
          break;
        case 'PENDING':
          relationshipMap.set(targetId, RelationshipType.REQUEST_PENDING);
          break;
        default:
          relationshipMap.set(targetId, RelationshipType.NONE);
      }
    });

    targetUserIds.forEach((id) => {
      if (!relationshipMap.has(id)) {
        relationshipMap.set(id, RelationshipType.NONE);
      }
    });

    return relationshipMap;
  }

  /**
   * Get relationship between two users (for ranking)
   */
  private async getRelationship(
    userId1: string,
    userId2: string,
  ): Promise<RelationshipType> {
    if (!userId2) return RelationshipType.NONE;

    const [u1, u2] =
      userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];

    const friendship = await this.prisma.friendship.findUnique({
      where: {
        user1Id_user2Id: {
          user1Id: u1,
          user2Id: u2,
        },
      },
      select: { status: true },
    });

    if (!friendship) return RelationshipType.NONE;

    switch (friendship.status) {
      case 'ACCEPTED':
        return RelationshipType.FRIEND;
      case 'PENDING':
        return RelationshipType.REQUEST_PENDING;
      default:
        return RelationshipType.NONE;
    }
  }

  /**
   * Create preview snippet (fallback khi không có preview_snippet từ DB)
   * FIX: Giảm window từ ±50 xuống ±30 chars để preview ngắn gọn hơn
   */
  private createPreview(content: string | null, keyword: string): string {
    if (!content) return '[No content]';
    if (!keyword) return content.substring(0, 80);

    const lower = content.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    const index = lower.indexOf(lowerKeyword);

    if (index === -1) {
      return content.substring(0, 80);
    }

    const start = Math.max(0, index - 30);
    const end = Math.min(content.length, index + lowerKeyword.length + 30);

    const prefix = start > 0 ? '...' : '';
    const suffix = end < content.length ? '...' : '';

    return `${prefix}${content.substring(start, end)}${suffix}`;
  }

  /**
   * Extract highlight positions (fallback khi không có preview_snippet từ DB)
   */
  private extractHighlights(
    content: string | null,
    keyword: string,
  ): Array<{ start: number; end: number; text: string }> {
    if (!content || !keyword) return [];

    const highlights: Array<{ start: number; end: number; text: string }> = [];
    const lower = content.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();

    let index = 0;
    while ((index = lower.indexOf(lowerKeyword, index)) !== -1) {
      highlights.push({
        start: index,
        end: index + lowerKeyword.length,
        text: content.substring(index, index + lowerKeyword.length),
      });
      index += lowerKeyword.length;
    }

    return highlights;
  }
}