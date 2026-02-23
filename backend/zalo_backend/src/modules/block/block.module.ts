import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BlockService } from './block.service';
import { BlockController } from './block.controller';
import { RedisModule } from '@modules/redis/redis.module';
import { IdempotencyModule } from '@common/idempotency/idempotency.module';
import { EventsModule } from '@shared/events';
import { SharedModule } from '@shared/shared.module';
import { BlockCacheListener } from './listeners/block-cache.listener';
import { CacheInvalidationListener } from './listeners/cache-invalidation.listener';
import { BlockAuthorizationHelper } from './services/block-authorization.helper';
import blockConfig from './config/block.config';
import socialConfig from '@config/social.config';
import { BLOCK_REPOSITORY, PrismaBlockRepository } from './repositories';
import { BLOCK_CHECKER } from './services/block-checker.interface';
import { BlockCheckerService } from './services/block-checker.service';

/**
 * BlockModule - REFACTORED (Event-Driven Architecture)
 *
 * CHANGES FROM ORIGINAL:
 * ✅ Removed BlockSocialListener (moved to FriendshipModule)
 * ✅ BlockEventHandler now ONLY handles cache invalidation
 * ✅ Follows Single Responsibility Principle
 *
 * Responsibilities:
 * - Block/Unblock user management (BlockService)
 * - Block API endpoints (BlockController)
 * - Cache invalidation for block-related data (BlockEventHandler)
 * - Authorization checks (BlockAuthorizationHelper)
 *
 * Event Listeners (Clear ownership per ARCHITECTURE.md):
 *
 * 1. BlockEventHandler: Owns block cache invalidation
 *    - Invalidates block status cache
 *    - Invalidates permission caches (message, call)
 *    - Does NOT touch friendship data (FriendshipModule's responsibility)
 *    - Does NOT delete group requests (removed per requirements)
 *
 * 2. CacheInvalidationListener: Global cache invalidation events
 *    - Current: Single-instance environment ✓
 *    - Future Phase 2: Multi-node sync via Redis Pub/Sub
 *
 * Design Pattern (Per ARCHITECTURE.md):
 * When 'user.blocked' event fires, multiple listeners react in parallel:
 * - BlockEventHandler (THIS MODULE): Invalidate block caches
 * - FriendshipBlockListener (FRIENDSHIP MODULE): Soft delete friendship
 * - SocketBlockListener (SOCKET MODULE): Disconnect sockets (if needed)
 * - No orchestration, no cross-module calls from listeners
 * - Each module makes independent decisions based on same event
 *
 * Removed Providers (Moved to other modules):
 * ❌ BlockSocialListener → FriendshipBlockListener (in FriendshipModule)
 */
@Module({
  imports: [
    ConfigModule.forFeature(blockConfig),
    ConfigModule.forFeature(socialConfig), // TTL for BlockCheckerService cache
    RedisModule,
    EventsModule,
    IdempotencyModule, // For event handler idempotency tracking
    SharedModule, // Provides DisplayNameResolver for per-viewer name resolution
  ],
  controllers: [BlockController],
  providers: [
    BlockService,
    BlockAuthorizationHelper, // Authorization checks (STATELESS)
    BlockCacheListener, // PHASE 3: Cache invalidation (renamed from BlockEventHandler)
    CacheInvalidationListener, // Global cache invalidation events
    {
      provide: BLOCK_REPOSITORY,
      useClass: PrismaBlockRepository,
    },
    {
      provide: BLOCK_CHECKER,
      useClass: BlockCheckerService,
    },
  ],
  exports: [
    BlockService,
    BlockAuthorizationHelper,
    BLOCK_REPOSITORY,
    BLOCK_CHECKER, // For FriendshipModule & AuthorizationModule (avoid circular dep)
  ],
})
export class BlockModule { }
