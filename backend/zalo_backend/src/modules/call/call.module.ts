import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CallHistoryController } from './call-history.controller';
import { CallHistoryService } from './call-history.service';
import { CallSignalingGateway } from './call-signaling.gateway';
import { RedisModule } from '../redis/redis.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SharedModule } from '@shared/shared.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { PrivacyModule } from '@modules/privacy/privacy.module';
import { SocketModule } from 'src/socket/socket.module';
import callConfig from 'src/config/call.config';
import { DatabaseModule } from 'src/database/prisma.module';

// PHASE 2: WebRTC services
import { TurnCredentialService } from './services/turn-credential.service';
import { IceConfigService } from './services/ice-config.service';

// PHASE 4: Daily.co SFU integration
import { DailyCoService } from './services/daily-co.service';

// PHASE 3.5: Block event listener
import { CallBlockListener } from './listeners/call-block.listener';

// PHASE 3.3: Call ended event handler
import { CallEventHandler } from './listeners/call-event.handler';
import { IdempotencyModule } from '@common/idempotency/idempotency.module';

/**
 * CallModule (PHASE 2 - REFACTORED, PHASE 3.5 - EXTENDED)
 *
 * BREAKING CHANGE: Removed forwardRef(() => SocialModule)
 * WHY: Friendship events handled reactively via CallBlockListener
 * EVENT_DRIVEN: Block events trigger listener, no direct calls
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
 *
 * CALL PHASE 1: Added CallSignalingGateway
 * - WebSocket gateway for call signaling (initiate/accept/reject/hangup)
 * - SDP offer/answer and ICE candidate relay
 * - Call room management and disconnect handling
 *
 * CALL PHASE 2: Added WebRTC P2P infrastructure
 * - TurnCredentialService: generates HMAC-SHA1 TURN credentials (RFC 5766)
 * - IceConfigService: builds ICE server list + transport policy per user
 * - ConfigModule.forFeature(callConfig): call-related env vars
 *
 * CALL PHASE 4: Added Daily.co SFU integration
 * - DailyCoService: Daily.co REST API (rooms + meeting tokens)
 * - P2P→SFU fallback on ICE failure
 */
@Module({
  imports: [
    ConfigModule.forFeature(callConfig), // PHASE 2: call.config.ts (TURN/STUN/ICE env vars)
    RedisModule,
    EventEmitterModule,
    SharedModule,
    AuthorizationModule,
    PrivacyModule, // For privacy/block checks in CallSignalingGateway
    forwardRef(() => SocketModule), // For SocketStateService in CallSignalingGateway
    DatabaseModule, // PrismaService for group conversation type check
    IdempotencyModule, // For CallEventHandler idempotency tracking
  ],
  controllers: [CallHistoryController],
  providers: [
    CallHistoryService,
    CallSignalingGateway, // CALL PHASE 1: Call signaling gateway

    // PHASE 2: WebRTC P2P services
    TurnCredentialService,  // HMAC-SHA1 TURN credential generation
    IceConfigService,       // STUN/TURN server list + iceTransportPolicy

    // PHASE 4: Daily.co SFU integration
    DailyCoService,         // Daily.co REST API (rooms + meeting tokens)

    // PHASE 3.5: Block event listener
    CallBlockListener, // Listen to BlockModule events

    // PHASE 3.3: Call ended event handler
    CallEventHandler, // Listen to call.ended events → emit CALL_LOG_MESSAGE_NEEDED
  ],
  exports: [CallHistoryService],
})
export class CallModule { }
