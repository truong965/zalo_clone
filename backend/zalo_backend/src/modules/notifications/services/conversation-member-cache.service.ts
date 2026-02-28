/**
 * ConversationMemberCacheService — Redis cache for conversation member states.
 *
 * Caches { userId, isMuted, isArchived } for all members of a conversation.
 * Used by notification listeners to avoid N+1 DB queries per message event.
 *
 * Cache strategy:
 * - Read-through: cache miss → query DB → populate cache
 * - TTL: 5 minutes (configurable)
 * - Invalidation: on member change events (conversation.member_added, member_left,
 *   conversation.muted, conversation.archived)
 *
 * Performance: Group 50 members, 100 msg/min → 2 DB queries/5min vs 100/min = 98% reduction.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';

/** Cached member state — minimal fields for notification decisions */
export interface CachedMemberState {
      userId: string;
      isMuted: boolean;
      isArchived: boolean;
}

/** Cache TTL in seconds */
const CACHE_TTL_SECONDS = 300; // 5 minutes

@Injectable()
export class ConversationMemberCacheService {
      private readonly logger = new Logger(ConversationMemberCacheService.name);

      constructor(
            private readonly prisma: PrismaService,
            private readonly redis: RedisService,
      ) { }

      /**
       * Get all member states for a conversation (read-through cache).
       *
       * @returns Array of member states, or empty array if conversation not found.
       */
      async getMembers(conversationId: string): Promise<CachedMemberState[]> {
            // 1. Try cache first
            const cached = await this.getFromCache(conversationId);
            if (cached) return cached;

            // 2. Cache miss → query DB
            const members = await this.queryFromDb(conversationId);

            // 3. Populate cache (fire-and-forget, don't block)
            void this.setCache(conversationId, members);

            return members;
      }

      /**
       * Invalidate cache for a conversation.
       * Called when member states change (add/remove/mute/archive).
       */
      async invalidate(conversationId: string): Promise<void> {
            const key = RedisKeyBuilder.notificationConvMembers(conversationId);
            await this.redis.getClient().del(key);
            this.logger.debug(`Cache invalidated: ${conversationId.slice(0, 8)}…`);
      }

      // ─── Event-driven cache invalidation ─────────────────────────────

      /** Member added → invalidate */
      @OnEvent('conversation.member.added')
      async onMemberAdded(event: { conversationId: string }): Promise<void> {
            await this.invalidate(event.conversationId);
      }

      /** Member left/removed → invalidate */
      @OnEvent('conversation.member.left')
      async onMemberLeft(event: { conversationId: string }): Promise<void> {
            await this.invalidate(event.conversationId);
      }

      /** Mute toggled → invalidate */
      @OnEvent('conversation.muted')
      async onMuted(event: { conversationId: string }): Promise<void> {
            await this.invalidate(event.conversationId);
      }

      /** Archive toggled → invalidate */
      @OnEvent('conversation.archived')
      async onArchived(event: { conversationId: string }): Promise<void> {
            await this.invalidate(event.conversationId);
      }

      // ─── Internal helpers ─────────────────────────────────────────────

      private async getFromCache(conversationId: string): Promise<CachedMemberState[] | null> {
            try {
                  const key = RedisKeyBuilder.notificationConvMembers(conversationId);
                  const raw = await this.redis.getClient().get(key);
                  if (!raw) return null;
                  return JSON.parse(raw) as CachedMemberState[];
            } catch {
                  // Cache read error → fall through to DB
                  return null;
            }
      }

      private async queryFromDb(conversationId: string): Promise<CachedMemberState[]> {
            const members = await this.prisma.conversationMember.findMany({
                  where: { conversationId },
                  select: {
                        userId: true,
                        isMuted: true,
                        isArchived: true,
                  },
            });

            return members.map((m) => ({
                  userId: m.userId,
                  isMuted: m.isMuted,
                  isArchived: m.isArchived,
            }));
      }

      private async setCache(conversationId: string, members: CachedMemberState[]): Promise<void> {
            try {
                  const key = RedisKeyBuilder.notificationConvMembers(conversationId);
                  await this.redis.getClient().set(key, JSON.stringify(members), 'EX', CACHE_TTL_SECONDS);
            } catch (error) {
                  // Non-critical — cache write failure just means next read hits DB
                  this.logger.warn(`Cache write failed: ${(error as Error).message}`);
            }
      }
}
