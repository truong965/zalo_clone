import { Module } from '@nestjs/common';
import { RedisModule } from '@shared/redis/redis.module';
import { IdempotencyModule } from '@common/idempotency/idempotency.module';
import { EventsModule } from '@shared/events';

// Services
import { PrivacyService } from './services/privacy.service';

// Controller
import { PrivacyController } from './privacy.controller';

// Listeners
import { PrivacyCacheListener } from './listeners/privacy-cache.listener';
import { PrivacyFriendshipListener } from './listeners/privacy-friendship.listener';
import { PrivacyBlockListener } from './listeners/privacy-block.listener';
import { PrivacyUserRegisteredListener } from './listeners/privacy-user-registered.listener';
import { DatabaseModule } from '@database/prisma.module';
import { BlockModule } from '@modules/block/block.module';
import { PRIVACY_READ_PORT } from '@common/contracts/internal-api';
import { PrivacyReadAdapter } from './internal-api/privacy-read.adapter';

/**
 * PrivacyModule (PHASE 7 - REFACTORED EVENT-DRIVEN)
 *
 * PHASE 1 Features: Core Privacy Settings Management
 * - Get/Update privacy settings
 * - Check permissions (message, call, profile visibility)
 * - Handle cache invalidation
 *
 * PHASE 7+ Changes: Keep module boundaries while supporting read-through checks
 * - ✅ Uses BlockChecker contract from BlockModule (no BlockService direct call)
 * - ✅ Keeps event-driven cache invalidation
 * - ✅ Privacy checks use Redis cache with BlockChecker fallback on miss
 *
 * Event-driven architecture:
 * - Listen to friendship events (friend_request.accepted, unfriended)
 * - Listen to block events (user.blocked, user.unblocked) → invalidate cache
 * - Listen to privacy update events (privacy.updated)
 *
 * Cache Hierarchy:
 * 1. BlockService owns block status cache (redis: social:block:*)
 * 2. PrivacyService owns permission cache (redis: social:permission:*)
 * 3. PrivacyBlockListener invalidates on events
 * 4. PrivacyService queries Redis, falls back via BlockChecker if cache miss
 *
 * Exports:
 * - PrivacyService: Core service for other modules to check permissions
 */
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    EventsModule,
    IdempotencyModule,
    BlockModule,
  ],
  controllers: [PrivacyController],
  providers: [
    PrivacyService,
    PrivacyReadAdapter,
    {
      provide: PRIVACY_READ_PORT,
      useExisting: PrivacyReadAdapter,
    },

    // Event Listeners (Idempotent, separated by concern)
    PrivacyCacheListener, // PHASE 4: Handle privacy.updated
    PrivacyFriendshipListener, // Handle friendship events
    PrivacyBlockListener, // Handle block events → cache invalidation
    PrivacyUserRegisteredListener, // Create default PrivacySettings on registration
  ],
  exports: [
    PrivacyService,
    PRIVACY_READ_PORT,
  ], // Keep legacy export + new contract token
})
export class PrivacyModule { }
