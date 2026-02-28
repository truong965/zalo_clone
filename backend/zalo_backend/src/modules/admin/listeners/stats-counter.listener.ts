import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RedisService } from '@modules/redis/redis.service';
import { PrismaService } from '@database/prisma.service';
import { UserStatus } from '@prisma/client';
import type { UserRegisteredEvent } from '@modules/auth/events';
import type { MessageSentEvent } from '@modules/message/events';

/**
 * Payload shape for the raw `call.ended` event
 * (emitted directly via EventEmitter2 in CallHistoryService).
 */
interface CallEndedPayload {
      callId: string;
      callType: string;
      initiatorId: string;
      receiverIds: string[];
      conversationId?: string;
      status: string;
      reason: string;
      provider: string;
      durationSeconds: number;
}

/**
 * Payload shape for the raw `media.uploaded` event
 * (emitted directly via EventEmitter2 in MediaUploadService).
 */
interface MediaUploadedPayload {
      mediaId: string;
      uploadId: string;
      userId: string;
      mimeType: string;
      mediaType: string;
}

// ─── Redis Key Helpers ───────────────────────────────────────────────

const STATS_KEYS = {
      USERS_TOTAL: 'stats:users:total',
      MESSAGES_DAILY: (yyyymmdd: string) => `stats:messages:daily:${yyyymmdd}`,
      CALLS_DAILY: (yyyymmdd: string) => `stats:calls:daily:${yyyymmdd}`,
      MEDIA_DAILY: (yyyymmdd: string) => `stats:media:daily:${yyyymmdd}`,
} as const;

/** TTL for daily counters — 48 hours gives enough window for the cron job. */
const DAILY_KEY_TTL = 48 * 60 * 60; // 172 800 seconds

/**
 * Return today's date string in ICT (UTC+7) as `YYYYMMDD`.
 *
 * Using a fixed offset (+7 h) instead of Intl to avoid edge-case
 * locale issues in Docker containers without full ICU data.
 */
function todayICT(): string {
      const now = new Date();
      const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);
      const y = ict.getUTCFullYear();
      const m = String(ict.getUTCMonth() + 1).padStart(2, '0');
      const d = String(ict.getUTCDate()).padStart(2, '0');
      return `${y}${m}${d}`;
}

// ─── Listener ────────────────────────────────────────────────────────

/**
 * StatsCounterListener
 *
 * Increments lightweight Redis counters on every relevant domain event.
 * These counters power the real-time KPI cards on the admin dashboard.
 *
 * On startup, seeds `stats:users:total` from Postgres so the value is
 * correct even after Redis flush / first deploy.
 *
 * Online user count is handled separately by `RedisPresenceService`.
 */
@Injectable()
export class StatsCounterListener implements OnModuleInit {
      private readonly logger = new Logger(StatsCounterListener.name);

      constructor(
            private readonly redis: RedisService,
            private readonly prisma: PrismaService,
      ) { }

      // ── Bootstrap ────────────────────────────────────────────────────

      async onModuleInit(): Promise<void> {
            await this.seedUsersTotalIfMissing();
      }

      /**
       * Seed `stats:users:total` from Postgres when the key doesn't exist yet
       * (first deploy, or after a Redis flush).
       */
      private async seedUsersTotalIfMissing(): Promise<void> {
            const client = this.redis.getClient();
            const exists = await client.exists(STATS_KEYS.USERS_TOTAL);
            if (exists) return;

            const count = await this.prisma.user.count({
                  where: { status: { not: UserStatus.DELETED } },
            });
            await client.set(STATS_KEYS.USERS_TOTAL, count);
            this.logger.log(`Seeded ${STATS_KEYS.USERS_TOTAL} = ${count}`);
      }

      // ── Event Handlers ───────────────────────────────────────────────

      /**
       * user.registered → INCR stats:users:total
       *
       * Emitted via EventPublisher in UsersService.register().
       */
      @OnEvent('user.registered', { async: true })
      async onUserRegistered(_event: UserRegisteredEvent): Promise<void> {
            try {
                  const client = this.redis.getClient();
                  await client.incr(STATS_KEYS.USERS_TOTAL);
            } catch (err) {
                  this.logger.warn(`Redis INCR failed (user.registered): ${err}`);
            }
      }

      /**
       * message.sent → INCR stats:messages:daily:{YYYYMMDD}
       *
       * Emitted via EventPublisher in MessageService.sendMessage().
       */
      @OnEvent('message.sent', { async: true })
      async onMessageSent(_event: MessageSentEvent): Promise<void> {
            try {
                  const client = this.redis.getClient();
                  const key = STATS_KEYS.MESSAGES_DAILY(todayICT());
                  const count = await client.incr(key);
                  // Set TTL only on first increment to avoid resetting it every time
                  if (count === 1) {
                        await client.expire(key, DAILY_KEY_TTL);
                  }
            } catch (err) {
                  this.logger.warn(`Redis INCR failed (message.sent): ${err}`);
            }
      }

      /**
       * call.ended → INCR stats:calls:daily:{YYYYMMDD}
       *
       * Emitted directly in CallHistoryService (plain object payload).
       */
      @OnEvent('call.ended', { async: true })
      async onCallEnded(_event: CallEndedPayload): Promise<void> {
            try {
                  const client = this.redis.getClient();
                  const key = STATS_KEYS.CALLS_DAILY(todayICT());
                  const count = await client.incr(key);
                  if (count === 1) {
                        await client.expire(key, DAILY_KEY_TTL);
                  }
            } catch (err) {
                  this.logger.warn(`Redis INCR failed (call.ended): ${err}`);
            }
      }

      /**
       * media.uploaded → INCR stats:media:daily:{YYYYMMDD}
       *
       * Emitted directly in MediaUploadService.
       */
      @OnEvent('media.uploaded', { async: true })
      async onMediaUploaded(_event: MediaUploadedPayload): Promise<void> {
            try {
                  const client = this.redis.getClient();
                  const key = STATS_KEYS.MEDIA_DAILY(todayICT());
                  const count = await client.incr(key);
                  if (count === 1) {
                        await client.expire(key, DAILY_KEY_TTL);
                  }
            } catch (err) {
                  this.logger.warn(`Redis INCR failed (media.uploaded): ${err}`);
            }
      }
}

export { STATS_KEYS, todayICT };
