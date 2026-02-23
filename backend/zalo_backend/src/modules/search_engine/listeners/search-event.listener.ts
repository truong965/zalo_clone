import { Injectable, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import { RealTimeSearchService } from '../services/real-time-search.service';
import { SearchCacheService } from '../services/search-cache.service';
import type { MessageSentEvent } from '@modules/message/events';
import type {
  ConversationMemberAddedEvent,
  ConversationMemberLeftEvent,
} from '@modules/conversation/events';
import type {
  UserBlockedEventPayload,
  UserUnblockedEventPayload,
  PrivacySettingsUpdatedPayload,
} from '@shared/events/contracts';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import type { MediaDeletedEvent } from 'src/modules/media/events/media.events';
import type { ContactAliasUpdatedEvent } from '@modules/contact/events/contact.events';

/**
 * SearchEventListener (Phase A: Refactored)
 *
 * PURPOSE:
 * Event-driven search synchronization - Updates search results when domain events occur
 *
 * RESPONSIBILITIES:
 * 1. Listen to MESSAGE_SENT → Notify active subscribers + emit internal newMatch
 * 2. Listen to MESSAGE_DELETED → Cache invalidation + emit internal resultRemoved
 * 3. Listen to USER_BLOCKED / UNBLOCKED → Invalidate contact search cache
 * 4. Listen to FRIENDSHIP changes → Invalidate contact search cache
 * 5. Listen to CONVERSATION_MEMBER changes → Invalidate conversation membership cache
 * 6. Listen to PRIVACY_UPDATED → Invalidate contact search cache
 *
 * Phase A additions:
 * - conversation.member.added / left → membership cache invalidation
 * - privacy.updated → contact cache invalidation
 * - Emits search.internal.* events for SearchGateway socket emission (single source of truth)
 */
@Injectable()
export class SearchEventListener extends IdempotentListener {
  /** C1: Redis idempotency TTL for hot-path events (24 hours) */
  private readonly REDIS_IDEMPOTENCY_TTL_SECONDS = 86400;

  constructor(
    private readonly realTimeSearchService: RealTimeSearchService,
    private readonly searchCacheService: SearchCacheService,
    private readonly eventEmitter: EventEmitter2,
    prisma: PrismaService,
    @Optional() private readonly redis: RedisService,
  ) {
    super(prisma);
  }

  /**
   * C1: Redis-based idempotency for hot-path events.
   * Uses Redis SET NX with TTL instead of DB processed_events table.
   * Reduces 3 DB ops (findUnique → create → update) to 1 Redis SET NX.
   *
   * Falls back to DB-based withIdempotency() if Redis is unavailable.
   */
  private async withRedisIdempotency(
    eventKey: string,
    handler: () => Promise<void>,
  ): Promise<void> {
    if (!this.redis) {
      // Fallback to DB-based idempotency if Redis unavailable
      return this.withIdempotency(eventKey, handler);
    }

    const redisKey = `idempotent:search:${eventKey}`;

    try {
      // SET NX returns 'OK' if key was set (first time), null if already exists
      const result = await this.redis
        .getClient()
        .set(redisKey, '1', 'EX', this.REDIS_IDEMPOTENCY_TTL_SECONDS, 'NX');

      if (result !== 'OK') {
        this.logger.debug(
          `[SearchEvent] Duplicate event skipped (Redis NX): ${eventKey}`,
        );
        return;
      }

      await handler();
    } catch (error) {
      // If Redis SET fails, still try to run handler (best-effort idempotency)
      this.logger.warn(
        `[SearchEvent] Redis idempotency check failed for ${eventKey}, falling back: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      await handler();
    }
  }

  /**
   * Handle MESSAGE_SENT event
   *
   * A3: Early exit when no active subscribers — skips DB query + iteration.
   * A4: Uses findMatchingSubscriptions() (single-pass) instead of
   *     notifyActiveSearches() + getMatchingSubscriptions() (double-pass).
   *
   * Flow:
   * 1. Always invalidate search cache (cheap Redis SCAN)
   * 2. If no active subscribers → return early (skip DB query)
   * 3. Fetch full message from DB (lazy — only when subscribers exist)
   * 4. Single-pass matching via findMatchingSubscriptions()
   * 5. Emit internal event for SearchGateway socket delivery
   */
  @OnEvent('message.sent')
  async handleMessageSent(event: MessageSentEvent): Promise<void> {
    // C1: Use Redis SET NX for hot-path idempotency (replaces 3 DB ops with 1 Redis op)
    return this.withRedisIdempotency(
      `message-sent-${event.messageId}`,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing message.sent event: ${event.messageId}`,
        );

        try {
          // Always invalidate search cache for the conversation
          await this.searchCacheService.invalidateConversationCache(
            event.conversationId,
          );

          // A3: Early exit — no subscribers means no DB query needed for real-time
          if (!this.realTimeSearchService.hasActiveSubscriptions()) {
            this.logger.debug(
              `[SearchEvent] No active search subscribers, skipping real-time processing for ${event.messageId}`,
            );
            return;
          }

          // Lazy DB fetch — only when subscribers exist
          const message = await this.prisma.message.findUnique({
            where: { id: BigInt(event.messageId) },
            include: {
              sender: {
                select: {
                  id: true,
                  displayName: true,
                  avatarUrl: true,
                  phoneNumber: true,
                },
              },
              conversation: {
                select: {
                  id: true,
                  type: true,
                  name: true,
                },
              },
              // B5: Include media attachments for filename matching in matchesSearchSync
              mediaAttachments: {
                select: { originalName: true },
                where: { deletedAt: null },
              },
            },
          });

          if (!message) {
            this.logger.warn(
              `[SearchEvent] Message ${event.messageId} not found in database`,
            );
            return;
          }

          // A4: Single-pass matching (replaces notifyActiveSearches + getMatchingSubscriptions)
          const { matches, notifiedCount } =
            this.realTimeSearchService.findMatchingSubscriptions(message);


          this.logger.debug(
            `[SearchEvent] Found ${notifiedCount} matching subscribers for message ${event.messageId}`,
          );

          // Emit internal event for SearchGateway to handle socket emission
          // C5: Use batch notification to buffer matches within 100ms window
          if (matches.length > 0) {
            this.realTimeSearchService.queueBatchNotification(message, matches);
          }
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process message.sent event ${event.messageId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      },
    );
  }

  /**
   * Handle MESSAGE_DELETED event
   * Invalidate search cache and emit internal event for socket notification (TD-05)
   */
  @OnEvent('message.deleted')
  async handleMessageDeleted(event: {
    messageId: string;
    conversationId: string;
  }): Promise<void> {
    return this.withIdempotency(
      `message-deleted-${event.messageId}`,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing message.deleted event: ${event.messageId}`,
        );

        try {
          // Invalidate search cache for this conversation
          await this.searchCacheService.invalidateConversationCache(
            event.conversationId,
          );

          // Phase A (TD-05): Emit internal event for SearchGateway to push resultRemoved to active subscribers
          this.eventEmitter.emit(SocketEvents.SEARCH_INTERNAL_RESULT_REMOVED, {
            messageId: event.messageId,
            conversationId: event.conversationId,
          });

          this.logger.debug(
            `[SearchEvent] Processed message.deleted for ${event.messageId}`,
          );
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process message.deleted event ${event.messageId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    );
  }

  /**
   * Handle USER_BLOCKED event
   * Invalidate contact search cache for both users
   */
  @OnEvent('user.blocked')
  async handleUserBlocked(event: UserBlockedEventPayload): Promise<void> {
    return this.withIdempotency(
      `user-blocked-${event.blockerId}-${event.blockedId}`,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing user.blocked event: ${event.blockerId} blocked ${event.blockedId}`,
        );

        try {
          // Invalidate contact search cache for both users
          await Promise.all([
            this.searchCacheService.invalidateUserCache(event.blockerId),
            this.searchCacheService.invalidateUserCache(event.blockedId),
          ]);

          this.logger.debug(
            `[SearchEvent] Invalidated contact cache for users ${event.blockerId} and ${event.blockedId}`,
          );
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process user.blocked event: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    );
  }

  /**
   * Handle USER_UNBLOCKED event
   * Invalidate contact search cache for both users
   */
  @OnEvent('user.unblocked')
  async handleUserUnblocked(event: UserUnblockedEventPayload): Promise<void> {
    return this.withIdempotency(
      `user-unblocked-${event.blockerId}-${event.blockedId}`,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing user.unblocked event: ${event.blockerId} unblocked ${event.blockedId}`,
        );

        try {
          // Invalidate contact search cache for both users
          await Promise.all([
            this.searchCacheService.invalidateUserCache(event.blockerId),
            this.searchCacheService.invalidateUserCache(event.blockedId),
          ]);

          this.logger.debug(
            `[SearchEvent] Invalidated contact cache for users ${event.blockerId} and ${event.blockedId}`,
          );
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process user.unblocked event: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    );
  }

  /**
   * Handle FRIENDSHIP status changes
   * Invalidate contact search cache when friendship status changes
   */
  @OnEvent('friendship.accepted')
  async handleFriendshipAccepted(event: {
    userId1: string;
    userId2: string;
  }): Promise<void> {
    return this.withIdempotency(
      `friendship-accepted-${event.userId1}-${event.userId2}`,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing friendship.accepted event: ${event.userId1} <-> ${event.userId2}`,
        );

        try {
          await Promise.all([
            this.searchCacheService.invalidateUserCache(event.userId1),
            this.searchCacheService.invalidateUserCache(event.userId2),
          ]);

          this.logger.debug(
            `[SearchEvent] Invalidated contact cache for friendship update`,
          );
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process friendship.accepted event: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    );
  }

  @OnEvent('friendship.unfriended')
  async handleFriendshipUnfriended(event: {
    userId1: string;
    userId2: string;
  }): Promise<void> {
    return this.withIdempotency(
      `friendship-unfriended-${event.userId1}-${event.userId2}`,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing friendship.unfriended event: ${event.userId1} <-> ${event.userId2}`,
        );

        try {
          await Promise.all([
            this.searchCacheService.invalidateUserCache(event.userId1),
            this.searchCacheService.invalidateUserCache(event.userId2),
          ]);

          this.logger.debug(
            `[SearchEvent] Invalidated contact cache for unfriend event`,
          );
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process friendship.unfriended event: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    );
  }

  // ============================================================================
  // Phase B (TD-11): message.updated / message.edited → cache invalidation
  // ============================================================================

  /**
   * Handle MESSAGE_UPDATED / MESSAGE_EDITED event
   * When message content is edited, the PostgreSQL search_vector (GENERATED column)
   * auto-updates, but cached search results still serve stale content.
   * This handler invalidates the conversation cache to force re-query.
   *
   * Note: Listens to both 'message.updated' and 'message.edited' event names
   * for forward-compatibility — whichever the message module decides to emit.
   */
  @OnEvent('message.updated')
  @OnEvent('message.edited')
  async handleMessageUpdated(event: {
    messageId: string;
    conversationId: string;
  }): Promise<void> {
    return this.withIdempotency(
      `message-updated-${event.messageId}`,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing message.updated event: ${event.messageId}`,
        );

        try {
          // Invalidate search cache for this conversation
          await this.searchCacheService.invalidateConversationCache(
            event.conversationId,
          );

          this.logger.debug(
            `[SearchEvent] Invalidated cache for updated message ${event.messageId} in conversation ${event.conversationId}`,
          );
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process message.updated event ${event.messageId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    );
  }

  // ============================================================================
  // Phase A (TD-03): NEW event handlers for conversation membership + privacy
  // ============================================================================

  /**
   * Handle CONVERSATION_MEMBER_ADDED event
   * Invalidate conversation-scoped search caches so new member can search history
   */
  @OnEvent('conversation.member.added')
  async handleConversationMemberAdded(
    event: ConversationMemberAddedEvent,
  ): Promise<void> {
    const memberKey = event.memberIds?.join(',') ?? 'unknown';
    return this.withIdempotency(
      `conv-member-added-${event.conversationId}-${memberKey}`,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing conversation.member.added: ${event.memberIds?.length ?? 0} members added to ${event.conversationId}`,
        );

        try {
          // Invalidate conversation search cache (message search scope changed)
          await this.searchCacheService.invalidateConversationCache(
            event.conversationId,
          );

          // Invalidate contact cache for added members (they now have a new conversation)
          if (event.memberIds && event.memberIds.length > 0) {
            await Promise.all(
              event.memberIds.map((memberId) =>
                this.searchCacheService.invalidateUserCache(memberId),
              ),
            );

            // A1: Update real-time subscription scope — new members can now receive search results from this conversation
            for (const memberId of event.memberIds) {
              this.realTimeSearchService.updateSubscriptionScope(
                memberId,
                event.conversationId,
                'add',
              );
            }
          }

          this.logger.debug(
            `[SearchEvent] Invalidated caches and updated subscription scopes for conversation.member.added`,
          );
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process conversation.member.added: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    );
  }

  /**
   * Handle CONVERSATION_MEMBER_LEFT event
   * Invalidate caches so removed member no longer sees conversation in search scope
   */
  @OnEvent('conversation.member.left')
  async handleConversationMemberLeft(
    event: ConversationMemberLeftEvent,
  ): Promise<void> {
    return this.withIdempotency(
      `conv-member-left-${event.conversationId}-${event.memberId}`,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing conversation.member.left: ${event.memberId} left ${event.conversationId}`,
        );

        try {
          // Invalidate conversation search cache
          await this.searchCacheService.invalidateConversationCache(
            event.conversationId,
          );

          // Invalidate the leaving member's user cache (conversation scope changed)
          await this.searchCacheService.invalidateUserCache(event.memberId);

          // A1: Update real-time subscription scope — removed member must not receive search results from this conversation
          this.realTimeSearchService.updateSubscriptionScope(
            event.memberId,
            event.conversationId,
            'remove',
          );

          this.logger.debug(
            `[SearchEvent] Invalidated caches and updated subscription scope for conversation.member.left`,
          );
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process conversation.member.left: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    );
  }

  /**
   * Handle PRIVACY_SETTINGS_UPDATED event
   * Invalidate contact search caches — privacy changes affect who can find this user
   */
  @OnEvent('privacy.updated')
  async handlePrivacyUpdated(
    event: PrivacySettingsUpdatedPayload,
  ): Promise<void> {
    return this.withIdempotency(`privacy-updated-${event.userId}`, async () => {
      this.logger.debug(
        `[SearchEvent] Processing privacy.updated for user ${event.userId}`,
      );

      try {
        // Invalidate the user's contact search cache (their visibility changed)
        await this.searchCacheService.invalidateUserCache(event.userId);

        this.logger.debug(
          `[SearchEvent] Invalidated contact cache for privacy update of user ${event.userId}`,
        );
      } catch (error) {
        this.logger.error(
          `[SearchEvent] Failed to process privacy.updated: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    });
  }

  // ============================================================================
  // C4: NEW EVENT HANDLERS — conversation.updated, media.uploaded, user.profile.updated
  // ============================================================================

  /**
   * C4: Handle CONVERSATION_UPDATED event (e.g., group name/avatar change)
   * Invalidate group search cache so updated name appears in search results.
   * Notify GLOBAL subscribers if the new name matches their search keyword.
   *
   * Event emitter: ConversationService (when group info is updated)
   */
  @OnEvent('conversation.updated')
  async handleConversationUpdated(event: {
    conversationId: string;
    updatedBy?: string;
    changes?: { name?: string; avatarUrl?: string };
    eventId?: string;
  }): Promise<void> {
    return this.withIdempotency(
      event.eventId || `conv-updated-${event.conversationId}-${Date.now()}`,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing conversation.updated: ${event.conversationId}`,
        );

        try {
          // Invalidate group search cache (name may have changed)
          await this.searchCacheService.invalidateConversationCache(
            event.conversationId,
          );

          // Also invalidate global search cache for users in this conversation
          // (group name contributes to global search results)
          await this.searchCacheService.delByPattern(`search:global:*`);

          this.logger.debug(
            `[SearchEvent] Invalidated caches for conversation.updated: ${event.conversationId}`,
          );
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process conversation.updated: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    );
  }

  /**
   * C4: Handle MEDIA_UPLOADED event (media attachment processed and ready)
   * Invalidate media search cache so the new file appears in search results.
   *
   * Event emitter: MediaUploadService (when media processing completes)
   */
  @OnEvent('media.uploaded')
  async handleMediaUploaded(event: {
    mediaId: string;
    messageId?: string;
    conversationId: string;
    originalName?: string;
    mediaType?: string;
    uploadedBy: string;
    eventId?: string;
  }): Promise<void> {
    return this.withRedisIdempotency(
      event.eventId || `media-uploaded-${event.mediaId}`,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing media.uploaded: ${event.mediaId} in ${event.conversationId}`,
        );

        try {
          // Invalidate conversation-level search cache (new media available)
          await this.searchCacheService.invalidateConversationCache(
            event.conversationId,
          );

          // Invalidate global search cache for the uploader
          await this.searchCacheService.delByPattern(
            `search:global:${event.uploadedBy}:*`,
          );

          this.logger.debug(
            `[SearchEvent] Invalidated caches for media.uploaded: ${event.mediaId}`,
          );
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process media.uploaded: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    );
  }

  /**
   * C4: Handle USER_PROFILE_UPDATED event (displayName, avatar change)
   * Invalidate contact search cache so updated profile appears in search results.
   *
   * Event emitter: UserService (when user updates their profile)
   * Note: Event name is 'user.profile.updated' (matching existing convention in conversation-event.handler.ts)
   */
  @OnEvent('user.profile.updated')
  async handleUserProfileUpdated(event: {
    userId: string;
    updates?: { displayName?: string; avatarUrl?: string };
    eventId?: string;
  }): Promise<void> {
    return this.withIdempotency(
      event.eventId || `user-profile-updated-${event.userId}-${Date.now()}`,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing user.profile.updated for user ${event.userId}`,
        );

        try {
          // Invalidate contact search cache (displayName may have changed)
          await this.searchCacheService.invalidateUserCache(event.userId);

          // Invalidate global search cache for this user's contacts
          // (their search results include this user's profile)
          await this.searchCacheService.delByPattern(`search:global:*`);

          this.logger.debug(
            `[SearchEvent] Invalidated caches for user.profile.updated: ${event.userId}`,
          );
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process user.profile.updated: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    );
  }

  /**
   * Handle MEDIA_DELETED event (soft delete of a media attachment)
   * Invalidate relevant search/media caches so deleted media no longer appears.
   *
   * Event emitter: MediaUploadService.deleteMedia()
   */
  @OnEvent('media.deleted')
  async handleMediaDeleted(event: MediaDeletedEvent): Promise<void> {
    return this.withIdempotency(
      `media-deleted-${event.mediaId}`,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing media.deleted: ${event.mediaId} by user ${event.userId}`,
        );

        try {
          // Fetch the mediaAttachment to find which conversation it belongs to
          const media = await this.prisma.mediaAttachment.findUnique({
            where: { id: event.mediaId },
            select: {
              message: {
                select: { conversationId: true },
              },
            },
          });

          if (media?.message?.conversationId) {
            // Invalidate conversation-level search cache
            await this.searchCacheService.invalidateConversationCache(
              media.message.conversationId,
            );
          }

          // Invalidate global search cache for the deleting user
          await this.searchCacheService.delByPattern(
            `search:global:${event.userId}:*`,
          );

          this.logger.debug(
            `[SearchEvent] Invalidated caches for media.deleted: ${event.mediaId}`,
          );
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process media.deleted: ${error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      },
    );
  }

  /**
   * GAP-4: Handle contact.alias.updated event.
   *
   * When a user changes their alias for a contact, all cached search results
   * that contain resolved display names become stale (Phase 3 SQL queries
   * use COALESCE(alias, phoneBook, displayName) and results are cached).
   *
   * Invalidates:
   *   - Message search cache for the owner (sender names in results)
   *   - Global search cache for the owner (grouped results contain resolved names)
   *   - Contact search cache for the owner (contact names changed)
   */
  @OnEvent('contact.alias.updated')
  async handleContactAliasUpdated(
    event: ContactAliasUpdatedEvent,
  ): Promise<void> {
    const eventId =
      event.eventId ?? `contact-alias-updated-${event.ownerId}-${event.contactUserId}-${Date.now()}`;

    return this.withIdempotency(
      eventId,
      async () => {
        this.logger.debug(
          `[SearchEvent] Processing contact.alias.updated: owner=${event.ownerId} contact=${event.contactUserId}`,
        );

        try {
          // Invalidate all search caches for the alias owner (their search results are per-viewer)
          await Promise.all([
            this.searchCacheService.invalidateMessageSearchCache(),
            this.searchCacheService.invalidateGlobalSearchCache(event.ownerId),
            this.searchCacheService.invalidateContactSearchCache(event.ownerId),
          ]);

          this.logger.debug(
            `[SearchEvent] Invalidated search caches for contact.alias.updated: owner=${event.ownerId}`,
          );
        } catch (error) {
          this.logger.error(
            `[SearchEvent] Failed to process contact.alias.updated: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
      'SearchEventListener.handleContactAliasUpdated',
    );
  }
}
