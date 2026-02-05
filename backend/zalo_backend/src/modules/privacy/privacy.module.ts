import { Module } from '@nestjs/common';
import { RedisModule } from '@modules/redis/redis.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { IdempotencyModule } from '@common/idempotency/idempotency.module';

// Services
import { PrivacyService } from './services/privacy.service';

// Controller
import { PrivacyController } from './privacy.controller';

// Listeners
import { PrivacyCacheListener } from './listeners/privacy-cache.listener';
import { PrivacyFriendshipListener } from './listeners/privacy-friendship.listener';
import { PrivacyBlockListener } from './listeners/privacy-block.listener';

/**
 * PrivacyModule (PHASE 7 - REFACTORED EVENT-DRIVEN)
 *
 * PHASE 1 Features: Core Privacy Settings Management
 * - Get/Update privacy settings
 * - Check permissions (message, call, profile visibility)
 * - Handle cache invalidation
 *
 * PHASE 7 Changes: Remove Direct Service Call Dependencies
 * - ✅ Removed BlockModule import (breaks RULE 9)
 * - ✅ Implement event-driven cache invalidation
 * - ✅ Privacy checks use Redis cache + listener events
 *
 * Event-driven architecture:
 * - Listen to friendship events (friend_request.accepted, unfriended)
 * - Listen to block events (user.blocked, user.unblocked) → invalidate cache
 * - Listen to privacy update events (privacy.updated)
 *
 * Cache Hierarchy:
 * 1. BlockService owns block status cache (redis: social:block:*)
 * 2. PrivacyService owns permission cache (redis: social:permission:*)
 * 3. PrivacyBlockListener invalidates on events (no DB fallback)
 * 4. PrivacyService queries Redis, falls back to DB if cache miss
 *
 * Exports:
 * - PrivacyService: Core service for other modules to check permissions
 */
@Module({
  imports: [
    RedisModule,
    EventEmitterModule,
    IdempotencyModule,
    // REMOVED: BlockModule - Breaks RULE 9 (no direct service calls across modules)
    // Events provide decoupled communication instead
  ],
  controllers: [PrivacyController],
  providers: [
    PrivacyService,

    // Event Listeners (Idempotent, separated by concern)
    PrivacyCacheListener, // PHASE 4: Handle privacy.updated
    PrivacyFriendshipListener, // Handle friendship events
    PrivacyBlockListener, // Handle block events → cache invalidation
  ],
  exports: [PrivacyService], // Export for other modules to use
})
export class PrivacyModule {}
