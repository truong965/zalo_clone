import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SearchEngineController } from './search_engine.controller';

// Database
import { DatabaseModule } from 'src/database/prisma.module';

// Cross-module imports (Phase A: Delegate block/privacy/friendship to cached services)
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { BlockModule } from '@modules/block/block.module';
import { PrivacyModule } from '@modules/privacy/privacy.module';

// Services
import { MessageSearchService } from './services/message-search.service';
import { ContactSearchService } from './services/contact-search.service';
import { GlobalSearchService } from './services/global-search.service';
import { GroupSearchService } from './services/group-search.service';
import { MediaSearchService } from './services/media-search.service';
import { SearchValidationService } from './services/search-validation.service';
import { SearchCacheService } from './services/search-cache.service';
import { SearchAnalyticsService } from './services/search-analytics.service';
import { RealTimeSearchService } from './services/real-time-search.service'; // Phase 4

// Repositories
import { MessageSearchRepository } from './repositories/message-search.repository';
import { ContactSearchRepository } from './repositories/contact-search.repository';
import { GroupSearchRepository } from './repositories/group-search.repository';
import { MediaSearchRepository } from './repositories/media-search.repository';

// Listeners (Phase 4: Event-driven search sync)
import { SearchEventListener } from './listeners/search-event.listener';

// Gateways (Phase 4: Real-time search)
import { SearchGateway } from './gateways/search.gateway';

// Config
import searchConfig from './config/search.config';

@Module({
  imports: [
    ConfigModule.forFeature(searchConfig),
    DatabaseModule,
    EventEmitterModule,

    // Phase A: Import authorization modules for cached block/privacy/friendship checks
    AuthorizationModule, // Provides InteractionAuthorizationService (cached canInteract)
    BlockModule, // Provides IBlockChecker (Redis read-through cache)
    PrivacyModule, // Provides PrivacyService (batch getManySettings, cached)
  ],
  controllers: [SearchEngineController],
  providers: [
    // Services (Phase 1-3)
    MessageSearchService,
    ContactSearchService,
    GlobalSearchService,
    GroupSearchService,
    MediaSearchService,
    SearchValidationService,
    SearchCacheService,
    SearchAnalyticsService,

    // Phase 4: Real-time search
    RealTimeSearchService,

    // Repositories
    MessageSearchRepository,
    ContactSearchRepository,
    GroupSearchRepository,
    MediaSearchRepository,

    // Phase 4: Event listeners
    SearchEventListener,

    // Phase 4: WebSocket gateway
    SearchGateway,
  ],
  exports: [
    MessageSearchService,
    ContactSearchService,
    GlobalSearchService,
    GroupSearchService,
    MediaSearchService,
    SearchValidationService,
    SearchCacheService,
    SearchAnalyticsService,
    RealTimeSearchService, // Phase 4: Export for other modules
  ],
})
export class SearchEngineModule {}
