import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SearchSubscription,
  SearchSubscribePayload,
  SearchResultsPayload,
  SearchLoadMorePayload,
  SearchMoreResultsPayload,
} from 'src/common/interfaces/search-socket.interface';
import { MessageSearchService } from './message-search.service';
import { ContactSearchService } from './contact-search.service';
import { GlobalSearchService } from './global-search.service';
import { GroupSearchService } from './group-search.service';
import { MediaSearchService } from './media-search.service';
import { SearchValidationService } from './search-validation.service';
import { RedisService } from '@modules/redis/redis.service';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import type { MessageWithSearchContext } from '../interfaces/search-raw-result.interface';
import { MessageSearchRequestDto } from '../dto/search.dto';
import { ConfigService } from '@nestjs/config';

/**
 * Real-Time Search Service (Phase 4 — A1/A3/A4 refactored)
 * Manages in-memory search subscriptions for WebSocket-based real-time search
 *
 * Features:
 * - Subscribe/unsubscribe to search queries
 * - Notify subscribers when new matching messages arrive
 * - Auto-cleanup after 5 minutes of inactivity
 * - Memory-efficient (max 1000 concurrent subscriptions per server)
 *
 * Security (A1):
 * - Each subscription stores `allowedConversationIds` (populated at subscribe time)
 * - matchesSearchSync() enforces conversation membership check
 * - conversation.member.added/left events update subscription scopes
 *
 * Performance (A3/A4/C2):
 * - hasActiveSubscriptions() enables early-exit in event listener
 * - findMatchingSubscriptions() replaces the old notifyActiveSearches() + getMatchingSubscriptions()
 *   dual-iteration with a single pass
 * - C2: Keyword index for O(1) pre-filtering
 *
 * Scalability (C3):
 * - Redis Pub/Sub channel for cross-instance event propagation
 * - In-memory remains primary storage; Redis used for sync between instances
 * - Graceful fallback to local-only when Redis is unavailable
 */
@Injectable()
export class RealTimeSearchService implements OnModuleInit {
  private readonly logger = new Logger(RealTimeSearchService.name);

  // Map: userId -> Set<SearchSubscription>
  private activeSearches = new Map<string, Set<SearchSubscription>>();

  // C2: Keyword index for O(1) lookup — keyword → Set<socketId>
  private keywordIndex = new Map<string, Set<string>>();

  // Map: socketId -> cleanup timeout
  private cleanupTimers = new Map<string, NodeJS.Timeout>();

  // C3: Redis Pub/Sub channel name
  private readonly PUBSUB_CHANNEL = 'search:events';

  // C3: Unique instance identifier for ignoring self-published messages
  private readonly instanceId = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // C3: Whether Redis Pub/Sub is active
  private pubsubActive = false;

  // C5: Batch notification buffer — accumulates matches within a time window
  private readonly BATCH_INTERVAL_MS = 100;
  private batchBuffer = new Map<
    string, // socketId
    Array<{ keyword: string; userId: string; message: MessageWithSearchContext }>
  >();
  private batchTimer: NodeJS.Timeout | null = null;

  // Configuration
  private readonly MAX_SUBSCRIPTIONS_PER_USER = 100;
  private readonly SUBSCRIPTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_TOTAL_SUBSCRIPTIONS = 1000; // Per server instance

  constructor(
    private readonly messageSearchService: MessageSearchService,
    private readonly contactSearchService: ContactSearchService,
    private readonly globalSearchService: GlobalSearchService,
    private readonly groupSearchService: GroupSearchService,
    private readonly mediaSearchService: MediaSearchService,
    private readonly validationService: SearchValidationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    @Optional() private readonly redis: RedisService,
  ) { }

  private getInitialLimits(): {
    messageLimit: number;
    contactLimit: number;
    globalLimitPerType: number;
    mediaLimit: number;
    groupLimit: number;
  } {
    const messageLimit = this.configService.get<number>(
      'search.pagination.initialLoad.conversation',
      50,
    );
    const contactLimit = this.configService.get<number>(
      'search.pagination.initialLoad.contacts',
      100,
    );
    const globalLimitPerType = this.configService.get<number>(
      'search.pagination.initialLoad.globalGrouped',
      50,
    );
    const mediaLimit = this.configService.get<number>(
      'search.pagination.initialLoad.media',
      50,
    );
    const groupLimit = this.configService.get<number>(
      'search.pagination.initialLoad.groups',
      50,
    );

    return { messageLimit, contactLimit, globalLimitPerType, mediaLimit, groupLimit };
  }

  /**
   * C3: Initialize Redis Pub/Sub subscription for cross-instance sync.
   * Falls back to local-only mode if Redis is unavailable.
   */
  async onModuleInit(): Promise<void> {
    if (!this.redis) {
      this.logger.warn(
        'RedisService not available — running in local-only mode (no cross-instance sync)',
      );
      return;
    }

    try {
      const subscriber = this.redis.getSubscriber();
      await subscriber.subscribe(this.PUBSUB_CHANNEL);

      subscriber.on('message', (channel: string, rawMessage: string) => {
        if (channel !== this.PUBSUB_CHANNEL) return;

        try {
          const parsed = JSON.parse(rawMessage) as {
            instanceId: string;
            type: string;
            payload: Record<string, unknown>;
          };

          // Ignore messages from self
          if (parsed.instanceId === this.instanceId) return;

          this.handlePubSubMessage(parsed.type, parsed.payload);
        } catch (error) {
          this.logger.warn(
            `[PubSub] Failed to parse message: ${error instanceof Error ? error.message : 'Unknown'}`,
          );
        }
      });

      this.pubsubActive = true;
      this.logger.log(
        `C3: Redis Pub/Sub active on channel "${this.PUBSUB_CHANNEL}" (instance: ${this.instanceId})`,
      );
    } catch (error) {
      this.logger.warn(
        `C3: Failed to init Redis Pub/Sub, running local-only: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }
  }

  /**
   * C3: Handle incoming Pub/Sub messages from other instances.
   * Currently supports 'scope-update' for membership changes.
   */
  private handlePubSubMessage(
    type: string,
    payload: Record<string, unknown>,
  ): void {
    switch (type) {
      case 'scope-update': {
        const { userId, conversationId, action } = payload as {
          userId: string;
          conversationId: string;
          action: 'add' | 'remove';
        };
        // Apply scope update locally (without re-publishing)
        this.applyLocalScopeUpdate(userId, conversationId, action);
        break;
      }
      default:
        this.logger.debug(`[PubSub] Unknown message type: ${type}`);
    }
  }

  /**
   * C3: Publish a message to all instances via Redis Pub/Sub.
   */
  private async publishToInstances(
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.pubsubActive || !this.redis) return;

    try {
      const message = JSON.stringify({
        instanceId: this.instanceId,
        type,
        payload,
      });
      await this.redis.getPublisher().publish(this.PUBSUB_CHANNEL, message);
    } catch (error) {
      this.logger.warn(
        `[PubSub] Failed to publish: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }
  }

  /**
   * C3: Apply scope update locally without re-publishing.
   */
  private applyLocalScopeUpdate(
    userId: string,
    conversationId: string,
    action: 'add' | 'remove',
  ): void {
    const userSubs = this.activeSearches.get(userId);
    if (!userSubs || userSubs.size === 0) return;

    for (const subscription of userSubs) {
      if (action === 'add') {
        subscription.allowedConversationIds.add(conversationId);
      } else {
        subscription.allowedConversationIds.delete(conversationId);
      }
    }
  }

  /**
   * Subscribe a user to real-time search updates
   * Returns initial search results and registers for future updates
   *
   * A1: Populates `allowedConversationIds` from DB at subscribe time
   *     so matchesSearchSync() can enforce access control.
   */
  async subscribe(
    userId: string,
    socketId: string,
    payload: SearchSubscribePayload,
  ): Promise<SearchResultsPayload> {
    const startTime = Date.now();

    try {
      const trimmedKeyword = payload.keyword?.trim() ?? '';

      // Filter-only browse: conversation search with messageType but no keyword
      const isFilterOnlyBrowse =
        !trimmedKeyword &&
        payload.searchType === 'CONVERSATION' &&
        !!payload.conversationId &&
        !!payload.filters?.messageType;

      // Validate keyword unless filter-only browse mode
      if (!trimmedKeyword && !isFilterOnlyBrowse) {
        this.validationService.validateKeyword(payload.keyword);
      }

      // Phase 1: Do NOT perform search when keyword is too short (1-2 chars).
      // Return empty results (no error) to avoid noisy UX while the user is typing.
      // Exception: filter-only browse is allowed with empty keyword.
      if (trimmedKeyword.length > 0 && trimmedKeyword.length < 3 && !isFilterOnlyBrowse) {
        const executionTimeMs = Date.now() - startTime;
        return {
          keyword: payload.keyword,
          results: {
            messages: [],
            contacts: [],
            groups: [],
            media: [],
            totalCount: 0,
            executionTimeMs,
          },
          totalCount: 0,
          executionTimeMs,
          searchType: payload.searchType || 'CONVERSATION',
        };
      }

      // Validate keyword only when provided (non-empty)
      if (trimmedKeyword.length >= 3) {
        this.validationService.validateKeyword(payload.keyword);
      }

      // Check subscription limits
      this.enforceSubscriptionLimits(userId);

      // A1: Fetch user's active conversation IDs for access-safe matching
      const conversationIds =
        await this.validationService.getActiveConversationIds(userId);

      // Create subscription object
      const subscription: SearchSubscription = {
        socketId,
        userId,
        keyword: payload.keyword.toLowerCase().trim(),
        conversationId: payload.conversationId,
        searchType: payload.searchType || 'GLOBAL',
        filters: payload.filters,
        allowedConversationIds: new Set(conversationIds),
        createdAt: new Date(),
      };

      // Add to active searches
      if (!this.activeSearches.has(userId)) {
        this.activeSearches.set(userId, new Set());
      }

      this.activeSearches.get(userId)!.add(subscription);

      // C2: Maintain keyword index for O(1) lookup
      this.addToKeywordIndex(subscription.keyword, socketId);

      this.logger.log(
        `User ${userId} subscribed to search: "${payload.keyword}" (socket: ${socketId})`,
      );

      // Schedule auto-cleanup
      this.scheduleCleanup(socketId, userId);

      // Execute initial search
      const initialResults = await this.executeInitialSearch(
        userId,
        payload,
        startTime,
      );

      return initialResults;
    } catch (error) {
      this.logger.error(
        `Failed to subscribe user ${userId} to search: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Unsubscribe a user from real-time search
   */
  unsubscribe(userId: string, socketId: string): void {
    const userSearches = this.activeSearches.get(userId);

    if (userSearches) {
      // Remove all subscriptions for this socket
      const removed = Array.from(userSearches).filter(
        (sub) => sub.socketId === socketId,
      );

      removed.forEach((sub) => {
        userSearches.delete(sub);
        // C2: Remove from keyword index
        this.removeFromKeywordIndex(sub.keyword, socketId);
      });

      // Cleanup empty sets
      if (userSearches.size === 0) {
        this.activeSearches.delete(userId);
      }

      // Cancel cleanup timer
      const timer = this.cleanupTimers.get(socketId);
      if (timer) {
        clearTimeout(timer);
        this.cleanupTimers.delete(socketId);
      }

      this.logger.log(
        `User ${userId} unsubscribed from ${removed.length} search(es) (socket: ${socketId})`,
      );
    }
  }

  /**
   * A3: Check if there are any active search subscriptions.
   * Enables early-exit in SearchEventListener.handleMessageSent()
   * to skip DB queries when nobody is searching.
   */
  hasActiveSubscriptions(): boolean {
    return this.activeSearches.size > 0;
  }

  /**
   * A4: Single-pass matching — replaces old notifyActiveSearches() + getMatchingSubscriptions().
   *
   * Iterates all subscriptions ONCE, returns matching subscriptions
   * and the count. Also updates lastMatchedAt on matching subscriptions.
   *
   * A1: matchesSearchSync() now enforces allowedConversationIds.
   * B5: matchesSearchSync() now matches group name + media filenames.
   */
  findMatchingSubscriptions(newMessage: MessageWithSearchContext): {
    matches: SearchSubscription[];
    notifiedCount: number;
  } {
    const matches: SearchSubscription[] = [];

    // C2: Extract searchable text from message for keyword pre-filtering
    const searchableText = this.extractSearchableText(newMessage);

    // C2: Pre-filter — only check subscriptions whose keyword appears in the message
    const candidateSocketIds = this.getCandidateSocketIds(searchableText);

    if (candidateSocketIds.size === 0) {
      return { matches, notifiedCount: 0 };
    }

    for (const [userId, subscriptions] of this.activeSearches.entries()) {
      for (const subscription of subscriptions) {
        // C2: Skip subscriptions not in candidate set (O(1) lookup vs O(N) iteration)
        if (!candidateSocketIds.has(subscription.socketId)) {
          continue;
        }

        if (this.matchesSearchSync(newMessage, subscription)) {
          matches.push(subscription);
          subscription.lastMatchedAt = new Date();

          this.logger.debug(
            `Message ${newMessage.id} matches search "${subscription.keyword}" for user ${userId}`,
          );
        }
      }
    }

    if (matches.length > 0) {
      this.logger.log(
        `Found ${matches.length} matching subscriptions for message ${newMessage.id}`,
      );
    }

    return { matches, notifiedCount: matches.length };
  }

  /**
   * A2: Get subscriptions affected by a conversation (for targeted resultRemoved emit).
   * Returns subscriptions that are watching the given conversation
   * either directly (conversationId scope) or via GLOBAL with membership.
   */
  getSubscriptionsForConversation(
    conversationId: string,
  ): SearchSubscription[] {
    const result: SearchSubscription[] = [];

    for (const subscriptions of this.activeSearches.values()) {
      for (const subscription of subscriptions) {
        // Directly scoped to this conversation
        if (subscription.conversationId === conversationId) {
          result.push(subscription);
          continue;
        }
        // GLOBAL search with membership in this conversation
        if (
          !subscription.conversationId &&
          subscription.allowedConversationIds.has(conversationId)
        ) {
          result.push(subscription);
        }
      }
    }

    return result;
  }

  /**
   * A1: Update allowedConversationIds when membership changes.
   * Called by SearchEventListener on conversation.member.added/left events.
   */
  updateSubscriptionScope(
    userId: string,
    conversationId: string,
    action: 'add' | 'remove',
  ): void {
    // Apply locally
    this.applyLocalScopeUpdate(userId, conversationId, action);

    // C3: Propagate to other instances via Redis Pub/Sub
    void this.publishToInstances('scope-update', {
      userId,
      conversationId,
      action,
    });

    this.logger.debug(
      `Updated subscription scope for user ${userId}: ${action} conversation ${conversationId}`,
    );
  }

  /**
   * Get active subscription count (for monitoring)
   */
  getStats(): {
    totalSubscriptions: number;
    uniqueUsers: number;
    subscriptionsByType: Record<string, number>;
    keywordIndexSize: number;
  } {
    let totalSubscriptions = 0;
    const subscriptionsByType: Record<string, number> = {};

    for (const subscriptions of this.activeSearches.values()) {
      totalSubscriptions += subscriptions.size;

      subscriptions.forEach((sub) => {
        subscriptionsByType[sub.searchType] =
          (subscriptionsByType[sub.searchType] || 0) + 1;
      });
    }

    return {
      totalSubscriptions,
      uniqueUsers: this.activeSearches.size,
      subscriptionsByType,
      keywordIndexSize: this.keywordIndex.size, // C2: Track keyword index
    };
  }

  // ============================================================================
  // PHASE 2: LOAD MORE — Cursor-based pagination for search results
  // ============================================================================

  /**
   * Handle search:loadMore — fetch next page of results
   * Dispatches to appropriate service based on searchType
   */
  async handleLoadMore(
    userId: string,
    payload: SearchLoadMorePayload,
  ): Promise<SearchMoreResultsPayload> {
    const loadMoreLimit = this.configService.get<number>(
      'search.pagination.loadMore.default',
      50,
    );
    const maxLimit = this.configService.get<number>(
      'search.pagination.loadMore.max',
      200,
    );
    const limit = Math.min(payload.limit || loadMoreLimit, maxLimit);

    switch (payload.searchType) {
      case 'CONTACT': {
        const result = await this.contactSearchService.searchContacts(
          userId,
          {
            keyword: payload.keyword,
            limit,
            cursor: payload.cursor,
          },
        );
        return {
          searchType: 'CONTACT',
          data: result.data,
          nextCursor: result.meta.nextCursor,
          hasNextPage: result.meta.hasNextPage,
        };
      }

      case 'GROUP': {
        const result = await this.groupSearchService.searchGroups(
          userId,
          payload.keyword,
          limit,
          payload.cursor,
        );
        return {
          searchType: 'GROUP',
          data: result.data,
          nextCursor: result.meta.nextCursor,
          hasNextPage: result.meta.hasNextPage,
        };
      }

      case 'MEDIA': {
        const result = await this.mediaSearchService.searchMedia(
          userId,
          payload.keyword,
          limit,
          payload.mediaType,
          payload.cursor,
        );
        return {
          searchType: 'MEDIA',
          data: result.data,
          nextCursor: result.meta.nextCursor,
          hasNextPage: result.meta.hasNextPage,
        };
      }

      case 'CONVERSATION': {
        const searchRequest: MessageSearchRequestDto = {
          keyword: payload.keyword,
          limit,
          cursor: payload.cursor,
          messageType: payload.messageType,
          fromUserId: payload.fromUserId,
          startDate: payload.startDate,
          endDate: payload.endDate,
        };
        const result = await this.messageSearchService.searchInConversation(
          userId,
          payload.conversationId || '',
          searchRequest,
        );
        return {
          searchType: 'CONVERSATION',
          data: result.data,
          nextCursor: result.meta.nextCursor,
          hasNextPage: result.meta.hasNextPage,
        };
      }

      default:
        return {
          searchType: payload.searchType,
          data: [],
          hasNextPage: false,
        };
    }
  }

  // ============================================================================
  // C5: BATCH NOTIFICATION — buffers matches within 100ms window
  // ============================================================================

  /**
   * C5: Queue a match for batched notification instead of emitting immediately.
   * Accumulates matches per socketId and flushes every BATCH_INTERVAL_MS.
   * During high chat traffic, this reduces N socket emissions to 1 batched emission.
   *
   * @param message - The matching message
   * @param subscriptions - All subscriptions that matched
   */
  queueBatchNotification(
    message: MessageWithSearchContext,
    subscriptions: SearchSubscription[],
  ): void {
    for (const sub of subscriptions) {
      if (!this.batchBuffer.has(sub.socketId)) {
        this.batchBuffer.set(sub.socketId, []);
      }
      this.batchBuffer
        .get(sub.socketId)!
        .push({ keyword: sub.keyword, userId: sub.userId, message });
    }

    // Start batch timer if not already running
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatchBuffer();
      }, this.BATCH_INTERVAL_MS);
    }
  }

  /**
   * C5: Flush the batch buffer — emit all accumulated matches to their sockets.
   * Emits SEARCH_INTERNAL_NEW_MATCH with grouped messages per subscription.
   */
  private flushBatchBuffer(): void {
    this.batchTimer = null;

    if (this.batchBuffer.size === 0) return;

    for (const [socketId, entries] of this.batchBuffer.entries()) {
      if (entries.length === 0) continue;

      // Group by keyword to emit per-keyword batches
      const byKeyword = new Map<string, { message: MessageWithSearchContext; userId: string }>();

      for (const entry of entries) {
        // Keep the latest message per keyword
        byKeyword.set(entry.keyword, { message: entry.message, userId: entry.userId });
      }

      // Emit one event per keyword-socketId pair (with the latest message)
      for (const [keyword, { message: latestMessage, userId }] of byKeyword.entries()) {
        this.eventEmitter.emit(SocketEvents.SEARCH_INTERNAL_NEW_MATCH, {
          message: latestMessage,
          subscriptions: [{ socketId, keyword, userId }],
        });
      }
    }

    const totalEntries = Array.from(this.batchBuffer.values()).reduce(
      (sum, entries) => sum + entries.length,
      0,
    );

    if (totalEntries > 0) {
      this.logger.debug(
        `[BatchNotify] Flushed ${totalEntries} entries to ${this.batchBuffer.size} sockets`,
      );
    }

    this.batchBuffer.clear();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Execute initial search query and return results
   *
   * B4: Handles all search types:
   * - GLOBAL → GlobalSearchService.globalSearch() (messages + contacts + groups + media)
   * - CONVERSATION → MessageSearchService.searchInConversation()
   * - CONTACT → ContactSearchService.searchContacts()
   * - MEDIA → MediaSearchService.searchMedia()
   */
  private async executeInitialSearch(
    userId: string,
    payload: SearchSubscribePayload,
    startTime: number,
  ): Promise<SearchResultsPayload> {
    try {
      const searchType = payload.searchType || 'CONVERSATION';
      const { messageLimit, contactLimit, globalLimitPerType, mediaLimit, groupLimit } =
        this.getInitialLimits();

      switch (searchType) {
        case 'GLOBAL': {
          const globalResults = await this.globalSearchService.globalSearch(
            userId,
            {
              keyword: payload.keyword,
              limitPerType: globalLimitPerType,
            },
          );

          return {
            keyword: payload.keyword,
            results: globalResults,
            totalCount: globalResults.totalCount,
            executionTimeMs: globalResults.executionTimeMs,
            searchType: 'GLOBAL',
          };
        }

        case 'CONTACT': {
          const contactResults = await this.contactSearchService.searchContacts(
            userId,
            {
              keyword: payload.keyword,
              limit: contactLimit,
            },
          );
          const executionTimeMs = Date.now() - startTime;

          return {
            keyword: payload.keyword,
            results: {
              messages: [],
              contacts: contactResults.data,
              groups: [],
              media: [],
              totalCount: contactResults.data.length,
              executionTimeMs,
            },
            totalCount: contactResults.data.length,
            executionTimeMs,
            searchType: 'CONTACT',
          };
        }

        case 'MEDIA': {
          const mediaResults = await this.mediaSearchService.searchMedia(
            userId,
            payload.keyword,
            mediaLimit,
            payload.filters?.mediaType,
          );
          const executionTimeMs = Date.now() - startTime;

          return {
            keyword: payload.keyword,
            results: {
              messages: [],
              contacts: [],
              groups: [],
              media: mediaResults.data,
              totalCount: mediaResults.data.length,
              executionTimeMs,
            },
            totalCount: mediaResults.data.length,
            executionTimeMs,
            searchType: 'MEDIA',
          };
        }

        case 'CONVERSATION':
        default: {
          // Conversation-scoped or default message search
          if (payload.conversationId) {
            const searchRequest: MessageSearchRequestDto = {
              keyword: payload.keyword,
              limit: messageLimit,
              cursor: undefined,
              messageType: payload.filters?.messageType,
              fromUserId: payload.filters?.fromUserId,
              startDate: payload.filters?.startDate,
              endDate: payload.filters?.endDate,
            };

            const results =
              await this.messageSearchService.searchInConversation(
                userId,
                payload.conversationId,
                searchRequest,
              );
            const executionTimeMs = Date.now() - startTime;

            return {
              keyword: payload.keyword,
              results: {
                messages: results.data,
                contacts: [],
                groups: [],
                media: [],
                totalCount: results.data.length,
                executionTimeMs,
              },
              totalCount: results.data.length,
              executionTimeMs,
              searchType: 'CONVERSATION',
            };
          }

          // No conversationId provided — return empty results
          const executionTimeMs = Date.now() - startTime;
          return {
            keyword: payload.keyword,
            results: {
              messages: [],
              contacts: [],
              groups: [],
              media: [],
              totalCount: 0,
              executionTimeMs,
            },
            totalCount: 0,
            executionTimeMs,
            searchType: 'CONVERSATION',
          };
        }
      }
    } catch (error) {
      this.logger.error(
        `Initial search failed for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      // Return empty results on error
      const executionTimeMs = Date.now() - startTime;
      return {
        keyword: payload.keyword,
        results: {
          messages: [],
          contacts: [],
          groups: [],
          media: [],
          totalCount: 0,
          executionTimeMs,
        },
        totalCount: 0,
        executionTimeMs,
        searchType: payload.searchType || 'CONVERSATION',
      };
    }
  }

  /**
   * Check if a message matches a search subscription (sync — for performance)
   *
   * A1: Enforces allowedConversationIds — user cannot receive notifications
   *     about messages in conversations they are not a member of.
   * B5: Also matches conversation/group name and media attachment filenames,
   *     not just message content. Enables real-time updates for all entity types.
   */
  private matchesSearchSync(
    message: MessageWithSearchContext,
    subscription: SearchSubscription,
  ): boolean {
    // 1. Check if message is soft-deleted
    if (message.deletedAt) {
      return false;
    }

    // 2. A1: Access control — message must be in a conversation the user has membership in
    if (!subscription.allowedConversationIds.has(message.conversationId)) {
      return false;
    }

    // 3. Check conversation scope (if subscription is scoped to a specific conversation)
    if (
      subscription.conversationId &&
      message.conversationId !== subscription.conversationId
    ) {
      return false;
    }

    // 4. Check message type filter
    if (
      subscription.filters?.messageType &&
      message.type !== subscription.filters.messageType
    ) {
      return false;
    }

    // 5. Check sender filter
    if (
      subscription.filters?.fromUserId &&
      message.senderId !== subscription.filters.fromUserId
    ) {
      return false;
    }

    // 6. Multi-entity keyword matching (diacritics-insensitive, case-insensitive)
    // FIX-VIET: Strip Vietnamese diacritics to match behavior of SQL unaccent()
    const normalizeText = (text: string) =>
      text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const keyword = normalizeText(subscription.keyword);

    // 6a. Match message content
    const content = normalizeText(message.content || '');
    if (content.includes(keyword)) {
      return true;
    }

    // 6b. B5: Match conversation/group name
    if (
      message.conversation?.name &&
      normalizeText(message.conversation.name).includes(keyword)
    ) {
      return true;
    }

    // 6c. B5: Match media attachment filenames
    if (message.mediaAttachments && message.mediaAttachments.length > 0) {
      for (const attachment of message.mediaAttachments) {
        if (normalizeText(attachment.originalName).includes(keyword)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Enforce subscription limits to prevent memory exhaustion
   */
  private enforceSubscriptionLimits(userId: string): void {
    // Check total subscriptions
    const totalSubs = Array.from(this.activeSearches.values()).reduce(
      (sum, set) => sum + set.size,
      0,
    );

    if (totalSubs >= this.MAX_TOTAL_SUBSCRIPTIONS) {
      throw new Error(
        `Maximum total subscriptions reached (${this.MAX_TOTAL_SUBSCRIPTIONS})`,
      );
    }

    // Check per-user limit
    const userSubs = this.activeSearches.get(userId);
    if (userSubs && userSubs.size >= this.MAX_SUBSCRIPTIONS_PER_USER) {
      throw new Error(
        `Maximum subscriptions per user reached (${this.MAX_SUBSCRIPTIONS_PER_USER})`,
      );
    }
  }

  /**
   * Schedule auto-cleanup after timeout
   */
  private scheduleCleanup(socketId: string, userId: string): void {
    // Cancel existing timer if any
    const existingTimer = this.cleanupTimers.get(socketId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new cleanup
    const timer = setTimeout(() => {
      this.unsubscribe(userId, socketId);
      this.logger.log(
        `Auto-cleaned up search subscription for socket ${socketId} after timeout`,
      );
    }, this.SUBSCRIPTION_TIMEOUT_MS);

    this.cleanupTimers.set(socketId, timer);
  }

  /**
   * Cleanup all subscriptions (called on service shutdown)
   */
  onModuleDestroy(): void {
    // Cancel all timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }

    // Clear all data structures
    this.activeSearches.clear();
    this.cleanupTimers.clear();
    this.keywordIndex.clear(); // C2

    // C5: Flush remaining batch buffer and clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.flushBatchBuffer();
    this.batchBuffer.clear();

    this.logger.log('Real-time search service cleanup complete');
  }

  // ============================================================================
  // C2: KEYWORD INDEX MANAGEMENT
  // ============================================================================

  /**
   * C2: Add a socketId to the keyword index.
   */
  private addToKeywordIndex(keyword: string, socketId: string): void {
    if (!this.keywordIndex.has(keyword)) {
      this.keywordIndex.set(keyword, new Set());
    }
    this.keywordIndex.get(keyword)!.add(socketId);
  }

  /**
   * C2: Remove a socketId from the keyword index. Cleans up empty sets.
   */
  private removeFromKeywordIndex(keyword: string, socketId: string): void {
    const socketIds = this.keywordIndex.get(keyword);
    if (!socketIds) return;

    socketIds.delete(socketId);
    if (socketIds.size === 0) {
      this.keywordIndex.delete(keyword);
    }
  }

  /**
   * C2: Extract searchable text from a message for keyword pre-filtering.
   * Returns lowercased concatenation of content + group name + media filenames.
   */
  private extractSearchableText(message: MessageWithSearchContext): string {
    const parts: string[] = [];

    if (message.content) {
      parts.push(message.content.toLowerCase());
    }

    if (message.conversation?.name) {
      parts.push(message.conversation.name.toLowerCase());
    }

    if (message.mediaAttachments) {
      for (const attachment of message.mediaAttachments) {
        if (attachment.originalName) {
          parts.push(attachment.originalName.toLowerCase());
        }
      }
    }

    return parts.join(' ');
  }

  /**
   * C2: Get candidate socketIds by checking which indexed keywords
   * appear in the searchable text. Returns union of all matching socketId sets.
   */
  private getCandidateSocketIds(searchableText: string): Set<string> {
    const candidates = new Set<string>();

    for (const [keyword, socketIds] of this.keywordIndex.entries()) {
      if (searchableText.includes(keyword)) {
        for (const socketId of socketIds) {
          candidates.add(socketId);
        }
      }
    }

    return candidates;
  }
}
