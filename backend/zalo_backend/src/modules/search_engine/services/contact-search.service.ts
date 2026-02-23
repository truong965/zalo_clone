import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { RelationshipType } from '../utils/ranking.util';
import { SearchErrorHandler } from '../utils/search-error.handler';
import {
  ContactSearchRequestDto,
  ContactSearchResultDto,
} from '../dto/search.dto';
import { CursorPaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { ContactSearchRepository } from '../repositories/contact-search.repository';
import { SearchValidationService } from './search-validation.service';
import { SearchCacheService } from './search-cache.service';
import { SearchAnalyticsService } from './search-analytics.service';

/**
 * Contact Search Service
 * Handles business logic for user/contact searching
 */

@Injectable()
export class ContactSearchService {
  private readonly logger = new Logger(ContactSearchService.name);

  constructor(
    private contactSearchRepository: ContactSearchRepository,
    private validationService: SearchValidationService,
    private cacheService: SearchCacheService,
    private analyticsService: SearchAnalyticsService,
  ) { }

  /**
   * Search contacts with privacy checks
   */
  async searchContacts(
    userId: string,
    request: ContactSearchRequestDto,
  ): Promise<CursorPaginatedResult<ContactSearchResultDto>> {
    try {
      // Validation
      this.validationService.validateKeyword(request.keyword);
      await this.validationService.validateUserExists(userId);

      // Cache key (include cursor for paginated requests)
      const excludeStr = (request.excludeIds || []).sort().join(',');
      const cursorStr = request.cursor || 'initial';
      const cacheKey = `search:contacts:${userId}:${request.keyword}:${request.limit || 50}:${request.hasAlias ? 'alias' : 'all'}:${excludeStr}:${cursorStr}`;

      // Check cache
      const cached =
        await this.cacheService.get<
          CursorPaginatedResult<ContactSearchResultDto>
        >(cacheKey);
      if (cached) {
        return cached;
      }

      const requestedLimit = request.limit || 50;

      // Execute search (fetches limit+1 rows for hasNextPage detection)
      const rawContacts = await this.contactSearchRepository.searchContacts(
        userId,
        request.keyword,
        requestedLimit,
        request.excludeIds,
        request.cursor,
      );

      // Detect hasNextPage from limit+1 pattern
      const hasNextPage = rawContacts.length > requestedLimit;
      const trimmedContacts = hasNextPage
        ? rawContacts.slice(0, requestedLimit)
        : rawContacts;

      // Phase A: Batch privacy checks — fixes N+1×4 problem
      // Before: N contacts × (block + privacy + friendship + onlineStatus) = 4N Prisma queries
      // After: 1 batch block check + 1 batch MGET privacy + 1 batch friendship query
      const contactIds = trimmedContacts.map((c) => c.id);
      const privacyContexts =
        await this.validationService.getBatchPrivacyContexts(
          userId,
          contactIds,
        );

      const filteredContacts = trimmedContacts
        .map((contact) => {
          const ctx = privacyContexts.get(contact.id);

          // Filter out only if blocked (search is always allowed — show_profile does NOT affect search)
          if (!ctx || ctx.isBlocked) {
            return null;
          }

          // Add privacy fields to contact
          return {
            ...contact,
            canMessage: ctx.canMessage,
            // Only include lastSeenAt/isOnline if privacy allows
            lastSeenAt: ctx.canSeeOnlineStatus ? contact.lastSeenAt : undefined,
            isOnline: ctx.canSeeOnlineStatus ? contact.isOnline : undefined,
            showProfile: ctx.showProfile,
          };
        })
        .filter((c) => c !== null);

      // Map to DTOs
      const results = this.contactSearchRepository.mapToDto(
        filteredContacts,
        userId,
      );

      // Build next cursor from last raw contact (before privacy filtering)
      let nextCursor: string | undefined;
      if (hasNextPage && trimmedContacts.length > 0) {
        const last = trimmedContacts[trimmedContacts.length - 1];
        nextCursor = Buffer.from(
          JSON.stringify({
            relevanceScore: last.relevance_score ?? 0,
            sortName: last.sort_name ?? '',
            lastId: last.id,
          }),
        ).toString('base64');
      }

      const response: CursorPaginatedResult<ContactSearchResultDto> = {
        data: results,
        meta: {
          limit: requestedLimit,
          hasNextPage,
          nextCursor,
          total: results.length,
        },
      };

      // Phase 3: Removed logSearchQuery - now only log when user clicks result

      // Cache result (5 minutes)
      await this.cacheService.set(
        cacheKey,
        response,
        this.cacheService.getTtl('contact'),
      );

      return response;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Search contacts by alias or phone-book name
   * Faster search when user has saved contacts
   */
  async searchByContactName(
    userId: string,
    keyword: string,
    limit = 50,
  ): Promise<ContactSearchResultDto[]> {
    try {
      this.validationService.validateKeyword(keyword);
      await this.validationService.validateUserExists(userId);

      // Cache key
      const cacheKey = `search:contacts:contactName:${userId}:${keyword}`;

      // Check cache
      const cached =
        await this.cacheService.get<ContactSearchResultDto[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Execute search
      const rawContacts = await this.contactSearchRepository.searchByContactName(
        userId,
        keyword,
        limit,
      );

      const results = this.contactSearchRepository.mapToDto(
        rawContacts,
        userId,
      );

      // Cache result (5 minutes)
      await this.cacheService.set(
        cacheKey,
        results,
        this.cacheService.getTtl('contact'),
      );

      return results;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get user's favorite/saved contacts
   */
  async getUserContacts(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<ContactSearchResultDto[]> {
    try {
      await this.validationService.validateUserExists(userId);

      // Cache key
      const cacheKey = `search:contacts:list:${userId}:${offset}:${limit}`;

      // Check cache
      const cached =
        await this.cacheService.get<ContactSearchResultDto[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Execute query
      const rawContacts = await this.contactSearchRepository.getUserContacts(
        userId,
        limit,
        offset,
      );

      const results = this.contactSearchRepository.mapToDto(
        rawContacts,
        userId,
      );

      // Cache result (5 minutes)
      await this.cacheService.set(
        cacheKey,
        results,
        this.cacheService.getTtl('contact'),
      );

      return results;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Get specific contact details (public profile)
   */
  async getContactDetails(
    viewerId: string,
    targetId: string,
  ): Promise<ContactSearchResultDto | null> {
    try {
      await this.validationService.validateUserExists(viewerId);
      await this.validationService.validateUserExists(targetId);

      // Check if viewer can see target's profile
      const canView = await this.validationService.validatePrivacySettings(
        viewerId,
        targetId,
      );

      if (!canView) {
        throw new ForbiddenException(
          "Cannot view this user's profile due to privacy settings",
        );
      }

      // Check if blocked
      const notBlocked = await this.validationService.validateNotBlocked(
        viewerId,
        targetId,
      );
      if (!notBlocked) {
        throw new ForbiddenException('This user is blocked');
      }

      // Get details
      const rawContact = await this.contactSearchRepository.getContactDetails(
        viewerId,
        targetId,
      );

      if (!rawContact) {
        return null;
      }

      // check can message 
      const canMessage = await this.validationService.canUserMessage(
        viewerId,
        targetId,
      );

      // Determine friendship status to compute privacy-limited fields correctly
      const friendshipStatus =
        await this.validationService.getFriendshipStatus(viewerId, targetId);

      const relationshipStatus: 'FRIEND' | 'REQUEST' | 'NONE' | 'BLOCKED' =
        friendshipStatus === RelationshipType.FRIEND
          ? 'FRIEND'
          : friendshipStatus === RelationshipType.REQUEST_PENDING
            ? 'REQUEST'
            : 'NONE';

      // Map to DTO
      const [result] = this.contactSearchRepository.mapToDto(
        [{ ...rawContact, relationship_status: relationshipStatus }],
        viewerId,
        canMessage,
      );

      return result;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Error handling — delegates to shared SearchErrorHandler (Phase B: TD-08)
   */
  private handleError(error: unknown): never {
    SearchErrorHandler.handle(error, 'Contact search', this.logger);
  }
}
