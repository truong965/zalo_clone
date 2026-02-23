import { Injectable, Logger } from '@nestjs/common';
import { MediaType } from '@prisma/client';
import { SearchErrorHandler } from '../utils/search-error.handler';
import {
  MediaSearchResultDto,
  MediaGroupedByConversationDto,
} from '../dto/search.dto';
import { CursorPaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { MediaSearchRepository } from '../repositories/media-search.repository';
import { SearchValidationService } from './search-validation.service';
import { SearchCacheService } from './search-cache.service';

/**
 * Media Search Service (B2)
 * Handles business logic for media attachment searching
 * Searches by filename with access control, caching, and validation
 */
@Injectable()
export class MediaSearchService {
  private readonly logger = new Logger(MediaSearchService.name);

  constructor(
    private readonly mediaSearchRepository: MediaSearchRepository,
    private readonly validationService: SearchValidationService,
    private readonly cacheService: SearchCacheService
  ) { }

  /**
   * Search media attachments by filename
   * Scoped to user's active conversations for access control
   * Supports cursor-based pagination
   */
  async searchMedia(
    userId: string,
    keyword: string,
    limit = 50,
    mediaType?: MediaType,
    cursor?: string,
  ): Promise<CursorPaginatedResult<MediaSearchResultDto>> {
    try {
      // Validation
      this.validationService.validateKeyword(keyword);
      await this.validationService.validateUserExists(userId);

      // Cache check (include cursor)
      const cursorStr = cursor || 'initial';
      const cacheKey = `search:media:${userId}:${keyword}:${limit}:${mediaType || 'all'}:${cursorStr}`;
      const cached =
        await this.cacheService.get<CursorPaginatedResult<MediaSearchResultDto>>(cacheKey);
      if (cached) {
        return cached;
      }

      // Get user's active conversation IDs for scope
      const conversationIds =
        await this.validationService.getActiveConversationIds(userId);

      if (conversationIds.length === 0) {
        return {
          data: [],
          meta: { limit, hasNextPage: false },
        };
      }

      // Execute search (fetches limit+1)
      const rawResults = await this.mediaSearchRepository.searchMedia(
        userId,
        keyword,
        conversationIds,
        limit,
        mediaType,
        cursor,
      );

      // Detect hasNextPage
      const hasNextPage = rawResults.length > limit;
      const trimmedResults = hasNextPage
        ? rawResults.slice(0, limit)
        : rawResults;

      // Map raw results to DTOs
      const data: MediaSearchResultDto[] = trimmedResults.map((raw) => ({
        id: raw.id,
        messageId: raw.message_id.toString(),
        originalName: raw.original_name,
        mediaType: raw.media_type as MediaType,
        mimeType: raw.mime_type,
        size: Number(raw.size),
        thumbnailUrl: raw.thumbnail_url || undefined,
        cdnUrl: raw.cdn_url || undefined,
        uploadedBy: raw.uploaded_by,
        uploadedByName: raw.uploaded_by_name,
        conversationId: raw.conversation_id,
        conversationName: raw.conversation_name || undefined,
        createdAt: raw.created_at,
      }));

      // Build next cursor
      let nextCursor: string | undefined;
      if (hasNextPage && trimmedResults.length > 0) {
        const last = trimmedResults[trimmedResults.length - 1];
        nextCursor = Buffer.from(
          JSON.stringify({
            lastCreatedAt: new Date(last.created_at).toISOString(),
            lastId: last.id,
          }),
        ).toString('base64');
      }

      const response: CursorPaginatedResult<MediaSearchResultDto> = {
        data,
        meta: {
          limit,
          hasNextPage,
          nextCursor,
          total: data.length,
        },
      };

      // Cache results (5 minutes)
      await this.cacheService.set(
        cacheKey,
        response,
        this.cacheService.getTtl('media'),
      );

      return response;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Search media grouped by conversation
   * Returns one entry per conversation with match count + latest match
   */
  async searchMediaGrouped(
    userId: string,
    keyword: string,
    limit = 50,
  ): Promise<MediaGroupedByConversationDto[]> {
    try {
      this.validationService.validateKeyword(keyword);
      await this.validationService.validateUserExists(userId);

      const cacheKey = `search:media:grouped:${userId}:${keyword}:${limit}`;
      const cached =
        await this.cacheService.get<MediaGroupedByConversationDto[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const conversationIds =
        await this.validationService.getActiveConversationIds(userId);
      if (conversationIds.length === 0) {
        return [];
      }

      const rawResults =
        await this.mediaSearchRepository.searchMediaGroupedByConversation(
          userId,
          keyword,
          conversationIds,
          limit,
        );

      const results: MediaGroupedByConversationDto[] = rawResults.map((raw) => ({
        conversationId: raw.conversation_id,
        conversationName: raw.conversation_name || '',
        conversationType: raw.conversation_type as 'DIRECT' | 'GROUP',
        conversationAvatar: raw.conversation_avatar || undefined,
        matchCount: Number(raw.match_count),
        latestMatch: {
          id: raw.latest_media_id,
          originalName: raw.original_name,
          mediaType: raw.media_type as MediaType,
          mimeType: raw.mime_type,
          size: Number(raw.size),
          thumbnailUrl: raw.thumbnail_url || undefined,
          cdnUrl: raw.cdn_url || undefined,
          uploadedByName: raw.uploaded_by_name,
          createdAt: raw.latest_created_at,
        },
      }));

      await this.cacheService.set(
        cacheKey,
        results,
        this.cacheService.getTtl('media'),
      );
      return results;
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    SearchErrorHandler.handle(error, 'Media search', this.logger);
  }
}
