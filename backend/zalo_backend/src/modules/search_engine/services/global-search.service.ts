import { Injectable, Logger } from '@nestjs/common';
import { SearchErrorHandler } from '../utils/search-error.handler';
import {
  ContactSearchResultDto,
  ConversationGroupedMessageDto,
  GlobalSearchRequestDto,
  GlobalSearchResultsDto,
  GroupSearchResultDto,
  MediaSearchResultDto,
  MediaGroupedByConversationDto,
} from '../dto/search.dto';
import { MessageSearchService } from './message-search.service';
import { ContactSearchService } from './contact-search.service';
import { GroupSearchService } from './group-search.service';
import { MediaSearchService } from './media-search.service';
import { SearchValidationService } from './search-validation.service';
import { SearchCacheService } from './search-cache.service';
import { SearchAnalyticsService } from './search-analytics.service';
import { ConfigService } from '@nestjs/config';

/**
 * Global Search Service (PHASE 2)
 * Unified search across all data types:
 * - Users/Contacts
 * - Messages (across all active conversations)
 * - Groups
 * - Media
 *
 * Executes sub-queries in parallel with timeouts
 */

@Injectable()
export class GlobalSearchService {
  private readonly logger = new Logger(GlobalSearchService.name);

  constructor(
    private messageSearchService: MessageSearchService,
    private contactSearchService: ContactSearchService,
    private groupSearchService: GroupSearchService,
    private mediaSearchService: MediaSearchService,
    private validationService: SearchValidationService,
    private cacheService: SearchCacheService,
    private analyticsService: SearchAnalyticsService,
    private configService: ConfigService,
  ) { }

  /**
   * Perform global search across all data types
   * Returns results from all types, merged and ranked
   */
  async globalSearch(
    userId: string,
    request: GlobalSearchRequestDto,
  ): Promise<GlobalSearchResultsDto> {
    try {
      // Validation
      this.validationService.validateKeyword(request.keyword);
      await this.validationService.validateUserExists(userId);

      // Cache key
      const cacheKey = `search:global:${userId}:${request.keyword}:${request.limit || 20}:${request.limitPerType || 5}`;

      // Check cache
      const cached =
        await this.cacheService.get<GlobalSearchResultsDto>(cacheKey);
      if (cached) {
        return cached;
      }

      // Start timer
      const startTime = Date.now();

      // Execute sub-queries in parallel with Promise.allSettled for fault tolerance
      const [messagesResult, contactsResult, groupsResult, mediaResult, mediaGroupedResult] =
        await Promise.allSettled([
          this.searchMessagesGlobalGrouped(userId, request),
          this.searchContactsGlobal(userId, request),
          this.searchGroupsGlobal(userId, request),
          this.searchMediaGlobal(userId, request),
          this.searchMediaGroupedGlobal(userId, request),
        ]);

      // Process results (skip if failed due to timeout)
      const conversationMessages =
        messagesResult.status === 'fulfilled' ? messagesResult.value : [];
      const contacts =
        contactsResult.status === 'fulfilled' ? contactsResult.value : [];
      const groups =
        groupsResult.status === 'fulfilled' ? groupsResult.value : [];
      const media = mediaResult.status === 'fulfilled' ? mediaResult.value : [];
      const mediaGrouped =
        mediaGroupedResult.status === 'fulfilled' ? mediaGroupedResult.value : [];

      const executionTimeMs = Date.now() - startTime;

      const response: GlobalSearchResultsDto = {
        conversationMessages,
        contacts,
        groups,
        media,
        mediaGrouped: mediaGrouped.length > 0 ? mediaGrouped : undefined,
        totalCount:
          conversationMessages.length +
          contacts.length +
          groups.length +
          media.length,
        executionTimeMs,
      };

      // Phase 3: Removed logSearchQuery - now only log when user clicks result (trackResultClick)
      // This reduces DB writes by 90-95% and ensures analytics reflect actual user interest

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
   * Search messages across all active conversations, grouped by conversation.
   * Wrapped with timeout
   */
  private async searchMessagesGlobalGrouped(
    userId: string,
    request: GlobalSearchRequestDto,
  ): Promise<ConversationGroupedMessageDto[]> {
    const timeout = this.configService.get<number>(
      'search.performance.queryTimeoutMs',
      5000,
    );

    return Promise.race([
      this.messageSearchService.searchGlobalGrouped(
        userId,
        request.keyword,
        request.limitPerType,
      ),
      this.createTimeout(timeout, 'Message search timeout'),
    ]);
  }

  /**
   * Search contacts
   * Wrapped with timeout
   */
  private async searchContactsGlobal(
    userId: string,
    request: GlobalSearchRequestDto,
  ): Promise<ContactSearchResultDto[]> {
    const timeout = this.configService.get<number>(
      'search.performance.queryTimeoutMs',
      5000,
    );

    return Promise.race([
      this.contactSearchService
        .searchContacts(userId, {
          keyword: request.keyword,
          limit: request.limitPerType || 5,
        })
        .then((r) => r.data),
      this.createTimeout(timeout, 'Contact search timeout'),
    ]);
  }

  /**
   * Search groups (B1)
   * Wrapped with timeout for fault tolerance
   */
  private async searchGroupsGlobal(
    userId: string,
    request: GlobalSearchRequestDto,
  ): Promise<GroupSearchResultDto[]> {
    const timeout = this.configService.get<number>(
      'search.performance.queryTimeoutMs',
      5000,
    );

    return Promise.race([
      this.groupSearchService.searchGroups(
        userId,
        request.keyword,
        request.limitPerType || 5,
      ).then((r) => r.data),
      this.createTimeout(timeout, 'Group search timeout'),
    ]);
  }

  /**
   * Search media (B2)
   * Wrapped with timeout for fault tolerance
   */
  private async searchMediaGlobal(
    userId: string,
    request: GlobalSearchRequestDto,
  ): Promise<MediaSearchResultDto[]> {
    const timeout = this.configService.get<number>(
      'search.performance.queryTimeoutMs',
      5000,
    );

    return Promise.race([
      this.mediaSearchService.searchMedia(
        userId,
        request.keyword,
        request.limitPerType || 5,
      ).then((r) => r.data),
      this.createTimeout(timeout, 'Media search timeout'),
    ]);
  }

  /**
   * Search media grouped by conversation (Phase 2)
   * Wrapped with timeout for fault tolerance
   */
  private async searchMediaGroupedGlobal(
    userId: string,
    request: GlobalSearchRequestDto,
  ): Promise<MediaGroupedByConversationDto[]> {
    const timeout = this.configService.get<number>(
      'search.performance.queryTimeoutMs',
      5000,
    );

    return Promise.race([
      this.mediaSearchService.searchMediaGrouped(
        userId,
        request.keyword,
        request.limitPerType || 5,
      ),
      this.createTimeout(timeout, 'Media grouped search timeout'),
    ]);
  }

  /**
   * Create timeout promise
   */
  private createTimeout(ms: number, message: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms),
    );
  }

  /**
   * Error handling — delegates to shared SearchErrorHandler (Phase B: TD-08 + TD-10)
   */
  private handleError(error: unknown): never {
    SearchErrorHandler.handle(error, 'Global search', this.logger);
  }
}
