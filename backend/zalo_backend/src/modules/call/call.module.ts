import { Module } from '@nestjs/common';
import { CallHistoryController } from './call-history.controller';
import { CallHistoryService } from './call-history.service';
import { RedisModule } from '../redis/redis.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SharedModule } from '@shared/shared.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';

// PHASE 2: Listeners (instead of direct SocialModule import)
import { CallContactLookupListener } from './listeners/call-contact-lookup.listener';
// PHASE 3.5: Block event listener
import { CallBlockListener } from './listeners/call-block.listener';

/**
 * CallModule (PHASE 2 - REFACTORED, PHASE 3.5 - EXTENDED)
 *
 * BREAKING CHANGE: Removed forwardRef(() => SocialModule)
 * WHY: CallContactLookupListener now listens to friendship events
 * EVENT_DRIVEN: Friendship changes trigger listener, no direct calls
 *
 * RESULT: SocialModule ↔ CallModule cycle broken ✅
 *
 * Before:
 *   SocialModule imports CallModule
 *   CallModule imports forwardRef(SocialModule) - CIRCULAR!
 *
 * After:
 *   SocialModule emits friendship events
 *   CallModule listens to events (no imports needed)
 *   Zero circular dependency ✅
 *
 * PHASE 3.5: Added CallBlockListener
 * - Listens to user.blocked events
 * - Terminates active calls between blocked users
 */
@Module({
  imports: [RedisModule, EventEmitterModule, SharedModule, AuthorizationModule],
  controllers: [CallHistoryController],
  providers: [
    CallHistoryService,

    // PHASE 2: Event Listeners (instead of direct imports)
    CallContactLookupListener, // Listen to SocialModule events
    // PHASE 3.5: Block event listener
    CallBlockListener, // Listen to BlockModule events
  ],
  exports: [CallHistoryService],
})
export class CallModule { }
