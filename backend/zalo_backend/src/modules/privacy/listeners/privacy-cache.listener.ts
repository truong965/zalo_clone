import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType } from '@prisma/client';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { RedisService } from '@modules/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';

/**
 * PrivacyCacheListener - PHASE 4 (renamed from PrivacyEventHandler)
 *
 * Handles privacy.updated: invalidate permission + privacy settings cache.
 * Single responsibility: cache invalidation on privacy settings change.
 */
@Injectable()
export class PrivacyCacheListener {
  private readonly logger = new Logger(PrivacyCacheListener.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @OnEvent('privacy.updated')
  async handlePrivacyUpdated(payload: {
    eventId?: string;
    userId?: string;
    settings?: Record<string, unknown>;
  }): Promise<void> {
    const userId = payload?.userId;
    const eventId =
      payload?.eventId ?? `privacy.updated-${userId}-${Date.now()}`;
    const handlerId = this.constructor.name;

    if (!userId) {
      this.logger.warn(`[PRIVACY] Invalid event payload: no userId`);
      return;
    }

    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );
      if (alreadyProcessed) {
        this.logger.debug(`[PRIVACY] Skipping duplicate: ${eventId}`);
        return;
      }
    } catch {
      /* proceed */
    }

    this.logger.log(`[PRIVACY] Cache invalidation for ${userId}`);

    try {
      const actions = ['message', 'call', 'profile'] as const;
      for (const action of actions) {
        const [p1, p2] =
          RedisKeyBuilder.socialPermissionPatternsForUser(action, userId);
        await this.redisService.deletePattern(p1);
        await this.redisService.deletePattern(p2);
      }

      await this.redisService.del(RedisKeyBuilder.socialPrivacy(userId));

      await this.idempotency.recordProcessed(
        eventId,
        handlerId,
        EventType.PRIVACY_SETTINGS_UPDATED,
      );

      this.logger.debug(`[PRIVACY] ✅ Cache invalidated for ${userId}`);
    } catch (error) {
      this.logger.error(`[PRIVACY] ❌ Cache invalidation failed:`, error);
      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.PRIVACY_SETTINGS_UPDATED,
        );
      } catch {
        /* ignore */
      }
      throw error;
    }
  }
}
