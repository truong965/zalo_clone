import { Injectable, Logger } from '@nestjs/common';
import { SearchErrorHandler } from '../utils/search-error.handler';
import {
  MessageSearchRequestDto,
  MessageSearchResultDto,
  ConversationGroupedMessageDto,
} from '../dto/search.dto';
import { CursorPaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { MessageSearchRepository } from '../repositories/message-search.repository';
import { SearchValidationService } from './search-validation.service';
import { SearchCacheService } from './search-cache.service';
import { SearchAnalyticsService } from './search-analytics.service';
import { PaginationUtil } from '../utils/pagination.util';

/**
 * Message Search Service
 * Handles business logic for message searching
 * Includes validation, caching, ranking, and analytics (Phase 3)
 */

@Injectable()
export class MessageSearchService {
  private readonly logger = new Logger(MessageSearchService.name);

  constructor(
    private messageSearchRepository: MessageSearchRepository,
    private validationService: SearchValidationService,
    private cacheService: SearchCacheService,
    private analyticsService: SearchAnalyticsService,
  ) { }

  /**
   * Search messages in a specific conversation
   */
  async searchInConversation(
    userId: string,
    conversationId: string,
    request: MessageSearchRequestDto,
  ): Promise<CursorPaginatedResult<MessageSearchResultDto>> {
    try {
      // Validation
      this.validationService.validateKeyword(request.keyword);
      await this.validationService.validateUserExists(userId);
      await this.validationService.validateConversationAccess(
        userId,
        conversationId,
      );

      // Build cache key including filter values to avoid stale cached results
      const filterParts = [
        request.fromUserId || '',
        request.startDate || '',
        request.endDate || '',
        request.messageType || '',
        request.hasMedia === undefined ? '' : request.hasMedia ? '1' : '0',
      ].join(':');
      const cacheKey = `search:messages:${conversationId}:${userId}:${request.keyword}:${request.cursor || '0'}:${filterParts}`;

      // Check cache
      const cached =
        await this.cacheService.get<
          CursorPaginatedResult<MessageSearchResultDto>
        >(cacheKey);
      if (cached) {
        return cached;
      }

      // Execute search
      const startTime = Date.now();

      const rawMessages =
        await this.messageSearchRepository.searchInConversation(
          userId,
          conversationId,
          request.keyword,
          request.limit,
          request.cursor,
          request.messageType,
          request.fromUserId,
          request.startDate ? new Date(request.startDate) : undefined,
          request.endDate ? new Date(request.endDate) : undefined,
          request.hasMedia, // Phase 4: hasMedia filter
        );

      const limit = PaginationUtil.normalizeLimit(request.limit, 100);
      const { items, nextCursor } = PaginationUtil.trimAndGetNextCursor(
        rawMessages,
        limit,
        'id',
        'created_at',
      );

      // Map to DTOs with ranking
      const results = await this.messageSearchRepository.mapToDto(
        items,
        userId,
        request.keyword,
      );

      const executionTimeMs = Date.now() - startTime;

      const response: CursorPaginatedResult<MessageSearchResultDto> = {
        data: results,
        meta: {
          limit,
          hasNextPage: rawMessages.length > limit,
          nextCursor,
        },
      };

      // Phase 3: Removed logSearchQuery - now only log when user clicks result

      // Cache result (5 minutes)
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

  /**
   * Get message context (messages around target ID)
   */
  async getMessageContext(
    userId: string,
    conversationId: string,
    targetMessageId: bigint,
    before = 10,
    after = 10,
  ): Promise<any> {
    try {
      // Validation
      await this.validationService.validateUserExists(userId);
      await this.validationService.validateConversationAccess(
        userId,
        conversationId,
      );

      // Get context (no caching - should be fast due to ID-based range query)
      const context = await this.messageSearchRepository.getMessageContext(
        userId,
        conversationId,
        targetMessageId,
        before,
        after,
      );

      // Map results to DTOs
      const messages = await this.messageSearchRepository.mapToDto(
        context.messages,
        userId,
        '', // No keyword for context view
      );

      const targetMessage = context.targetMessage
        ? (
          await this.messageSearchRepository.mapToDto(
            [context.targetMessage],
            userId,
            '',
          )
        )[0]
        : undefined;

      return {
        messages,
        targetMessage,
        totalInRange: context.totalInRange,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Search across user's active conversations (global message search)
   */
  async searchGlobal(
    userId: string,
    keyword: string,
    limit = 20,
  ): Promise<CursorPaginatedResult<MessageSearchResultDto>> {
    try {
      // Validation
      this.validationService.validateKeyword(keyword);
      await this.validationService.validateUserExists(userId);

      // Get active conversations
      const activeConversations =
        await this.validationService.getActiveConversationIds(userId);

      if (activeConversations.length === 0) {
        return {
          data: [],
          meta: {
            limit: limit || 50,
            hasNextPage: false,
          },
        };
      }

      // Cache key
      const cacheKey = `search:messages:global:${userId}:${keyword}`;

      // Check cache
      const cached =
        await this.cacheService.get<
          CursorPaginatedResult<MessageSearchResultDto>
        >(cacheKey);
      if (cached) {
        return cached;
      }

      // Execute search
      const startTime = Date.now();

      const rawMessages = await this.messageSearchRepository.searchGlobal(
        userId,
        keyword,
        limit,
        activeConversations,
      );

      // Map to DTOs
      const results = await this.messageSearchRepository.mapToDto(
        rawMessages,
        userId,
        keyword,
      );

      const executionTimeMs = Date.now() - startTime;

      const response: CursorPaginatedResult<MessageSearchResultDto> = {
        data: results,
        meta: {
          limit,
          hasNextPage: false, // Global search doesn't paginate
          total: results.length,
        },
      };

      // Phase 3: Removed logSearchQuery - now only log when user clicks result

      // Cache result (1 minute - global search changes frequently)
      await this.cacheService.set(
        cacheKey,
        response,
        this.cacheService.getTtl('global'),
      );

      return response;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Search across user's active conversations, grouped by conversation.
   * Returns one entry per conversation with match count + latest match preview.
   */
  async searchGlobalGrouped(
    userId: string,
    keyword: string,
    limit = 50,
  ): Promise<ConversationGroupedMessageDto[]> {
    try {
      // Validation
      this.validationService.validateKeyword(keyword);
      await this.validationService.validateUserExists(userId);

      // Get active conversations
      const activeConversations =
        await this.validationService.getActiveConversationIds(userId);

      if (activeConversations.length === 0) {
        return [];
      }

      // Cache key
      const cacheKey = `search:messages:global-grouped:${userId}:${keyword}`;

      // Check cache
      const cached =
        await this.cacheService.get<ConversationGroupedMessageDto[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Execute grouped search
      const rawRows =
        await this.messageSearchRepository.searchGlobalGroupedByConversation(
          userId,
          keyword,
          limit,
          activeConversations,
        );

      // Map to DTOs
      const results = this.messageSearchRepository.mapToGroupedDto(
        rawRows,
        keyword,
      );

      // Sort by matchCount desc, then by latest message time desc
      results.sort((a, b) => {
        if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
        return new Date(b.latestMatch.createdAt).getTime() - new Date(a.latestMatch.createdAt).getTime();
      });

      // Cache result (1 minute)
      await this.cacheService.set(
        cacheKey,
        results,
        this.cacheService.getTtl('global'),
      );

      return results;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Error handling — delegates to shared SearchErrorHandler (Phase B: TD-08)
   */
  private handleError(error: unknown): never {
    SearchErrorHandler.handle(error, 'Message search', this.logger);
  }
}
