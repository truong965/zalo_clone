/**
 * ContactCacheListener
 *
 * Handles contact domain events for Redis cache invalidation.
 *
 * Concerns:
 *   - Invalidate name-resolution cache on alias change
 *   - Invalidate name-resolution cache on contact removal
 *   - Log metrics on phone sync
 *
 * Idempotency:
 *   - All handlers wrapped with withIdempotency() via IdempotentListener
 *   - Redis DEL is safe to call multiple times
 */

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import type { ContactAliasUpdatedEvent } from '../events/contact.events';
import type { ContactRemovedEvent } from '../events/contact.events';
import type { ContactsSyncedEvent } from '../events/contact.events';

@Injectable()
export class ContactCacheListener extends IdempotentListener {
      constructor(
            prisma: PrismaService,
            private readonly redis: RedisService,
      ) {
            super(prisma);
      }

      /**
       * Invalidate name-resolution cache when alias is set or reset.
       *
       * The service already invalidates the cache synchronously before emitting
       * this event, so this listener acts as an idempotent safety net for cases
       * where the event is replayed by a message broker.
       */
      @OnEvent('contact.alias.updated')
      async handleAliasUpdated(event: ContactAliasUpdatedEvent): Promise<void> {
            return this.withIdempotency(
                  event.eventId,
                  async () => {
                        const key = RedisKeyBuilder.contactName(event.ownerId, event.contactUserId);
                        await this.redis.del(key);
                        this.logger.debug(
                              `[ContactCache] Invalidated name cache: owner=${event.ownerId} contact=${event.contactUserId}`,
                        );
                  },
                  'ContactCacheListener.handleAliasUpdated',
                  event.version,
                  event.correlationId,
            );
      }

      /**
       * Invalidate name-resolution cache when a contact is removed.
       */
      @OnEvent('contact.removed')
      async handleContactRemoved(event: ContactRemovedEvent): Promise<void> {
            return this.withIdempotency(
                  event.eventId,
                  async () => {
                        const key = RedisKeyBuilder.contactName(event.ownerId, event.contactUserId);
                        await this.redis.del(key);
                        this.logger.debug(
                              `[ContactCache] Invalidated name cache on removal: owner=${event.ownerId} contact=${event.contactUserId}`,
                        );
                  },
                  'ContactCacheListener.handleContactRemoved',
                  event.version,
            );
      }

      /**
       * Log sync metrics (fire-and-forget analytics).
       */
      @OnEvent('contacts.synced')
      async handleContactsSynced(event: ContactsSyncedEvent): Promise<void> {
            this.logger.log(
                  `[ContactCache] Sync completed: owner=${event.ownerId} total=${event.totalContacts} matched=${event.matchedCount} duration=${event.durationMs}ms`,
            );
      }
}
