import { Module } from '@nestjs/common';
import { RedisModule } from '@modules/redis/redis.module';
import { IdempotencyModule } from '@common/idempotency/idempotency.module';
import { EventsModule } from '@shared/events';
import { BlockModule } from '@modules/block/block.module';
import { PrivacyModule } from '@modules/privacy/privacy.module';

// Services
import { FriendshipService } from './service/friendship.service';

// Controllers
import { FriendshipsController } from './controller/friendships.controller';
import { FriendRequestController } from './controller/friendRequest.controller';

// R6: Split Listeners by Concern (Separate Files)
// Each listener handles ONE specific event and ONE responsibility
import { FriendRequestSentListener } from './listeners/friend-request-sent.listener';
import { FriendshipAcceptedListener } from './listeners/friendship-accepted.listener';
import { FriendRequestDeclinedListener } from './listeners/friend-request-declined.listener';
import { FriendRequestRemovedListener } from './listeners/friend-request-removed.listener';
import { UnfriendedListener } from './listeners/unfriended.listener';

// R10: Distributed Lock Service
import { DistributedLockService } from '@common/distributed-lock/distributed-lock.service';
import { FriendshipBlockListener } from './listeners/friendship-block.listener';

/**
 * FriendshipModule - Extracted from SocialModule (PHASE 6)
 *
 * PHASE 3.5: Complete Implementation with All Safety Features
 *
 * Key Features:
 * - R1: Dependency Injection via Facades (RedisCacheFacade)
 * - R5: Event ID Generation with UUID v4 validation
 * - R2: Clear Event Choreography (see EVENT_CHOREOGRAPHY.md)
 * - R6: Listeners split by concern (one event per listener)
 * - R8: Complete service layer with all business logic
 * - R9: Consistent Redis key generation (RedisKeyBuilder)
 * - R10: Distributed locks for state mutations
 * - R12: Privacy checks via InteractionAuthorizationService (TODO)
 * - R14: Type-safe event contracts (no "as any")
 *
 * Responsibilities:
 * - Manage friend requests (send, accept, decline, cancel)
 * - Manage friendships (unfriend, list friends, check status)
 * - Enforce friendship-based permissions (can message, can call)
 * - Emit friendship-related events (type-safe with eventId)
 * - Handle friendship event processing with idempotency
 *
 * Dependencies:
 * - BlockModule: Check if users are blocked
 * - PrivacyModule: Check privacy settings for messaging/calling
 * - RedisModule: Caching and distributed locks
 * - EventEmitterModule: Event publishing and listening
 * - IdempotencyModule: Prevent duplicate event processing
 *
 * Exports:
 * - FriendshipService: For other modules to query/manage friendships
 * - Guards: For protecting endpoints that require friendship status
 * - RedisCacheFacade: For cache operations
 */
@Module({
  imports: [
    RedisModule,
    EventsModule,
    IdempotencyModule,
    BlockModule,
    PrivacyModule,
  ],
  controllers: [FriendshipsController, FriendRequestController],
  providers: [
    FriendshipService,

    // R10: Distributed Lock Service for atomic state mutations
    DistributedLockService,

    // R6: Separate listeners by concern (one event per listener)
    FriendRequestSentListener,
    FriendshipAcceptedListener,
    FriendRequestDeclinedListener,
    FriendRequestRemovedListener,
    UnfriendedListener,
    FriendshipBlockListener,
  ],
  exports: [FriendshipService],
})
export class FriendshipModule {}
