import { Injectable, Logger } from '@nestjs/common';
import { SearchErrorHandler } from '../utils/search-error.handler';
import { GroupSearchResultDto } from '../dto/search.dto';
import { CursorPaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { GroupSearchRepository } from '../repositories/group-search.repository';
import { SearchValidationService } from './search-validation.service';
import { SearchCacheService } from './search-cache.service';

/**
 * Group Search Service (B1)
 * Handles business logic for group/conversation searching
 * Searches GROUP conversations by name with caching and validation
 */
@Injectable()
export class GroupSearchService {
  private readonly logger = new Logger(GroupSearchService.name);

  constructor(
    private readonly groupSearchRepository: GroupSearchRepository,
    private readonly validationService: SearchValidationService,
    private readonly cacheService: SearchCacheService,
  ) { }

  /**
   * Search group conversations by name
   * Only returns groups where the user is an ACTIVE member
   * Supports cursor-based pagination
   */
  async searchGroups(
    userId: string,
    keyword: string,
    limit = 50,
    cursor?: string,
  ): Promise<CursorPaginatedResult<GroupSearchResultDto>> {
    try {
      // Validation
      this.validationService.validateKeyword(keyword);
      await this.validationService.validateUserExists(userId);

      // Cache check (include cursor)
      const cursorStr = cursor || 'initial';
      const cacheKey = `search:groups:${userId}:${keyword}:${limit}:${cursorStr}`;
      const cached =
        await this.cacheService.get<CursorPaginatedResult<GroupSearchResultDto>>(cacheKey);
      if (cached) {
        return cached;
      }

      // Execute search (fetches limit+1)
      const rawResults = await this.groupSearchRepository.searchGroups(
        userId,
        keyword,
        limit,
        cursor,
      );

      // Detect hasNextPage
      const hasNextPage = rawResults.length > limit;
      const trimmedResults = hasNextPage
        ? rawResults.slice(0, limit)
        : rawResults;

      // Map raw results to DTOs
      const data: GroupSearchResultDto[] = trimmedResults.map((raw) => ({
        id: raw.id,
        name: raw.name || '',
        avatarUrl: raw.avatar_url || undefined,
        memberCount: raw.member_count,
        membersPreview: Array.isArray(raw.members_preview)
          ? raw.members_preview
          : [],
        isUserMember: raw.is_user_member,
        lastMessageAt: raw.last_message_at || undefined,
      }));

      // Build next cursor
      let nextCursor: string | undefined;
      if (hasNextPage && trimmedResults.length > 0) {
        const last = trimmedResults[trimmedResults.length - 1];
        nextCursor = Buffer.from(
          JSON.stringify({
            prefixMatch: (last as any).prefix_match ?? false,
            lastMessageAt: last.last_message_at
              ? new Date(last.last_message_at).toISOString()
              : null,
            lastId: last.id,
          }),
        ).toString('base64');
      }

      const response: CursorPaginatedResult<GroupSearchResultDto> = {
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
        this.cacheService.getTtl('user'),
      );

      return response;
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    SearchErrorHandler.handle(error, 'Group search', this.logger);
  }
}
