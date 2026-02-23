// src/modules/conversation/conversation.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from 'src/database/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventsModule } from '@shared/events';
import { SharedModule } from '@shared/shared.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { SocketModule } from 'src/socket/socket.module';
import { IdempotencyModule } from '@common/idempotency/idempotency.module';
import { PrivacyModule } from 'src/modules/privacy/privacy.module';

// Services
import { ConversationService } from './services/conversation.service';
import { GroupService } from './services/group.service';
import { GroupJoinService } from './services/group-join.service';
import { ConversationRealtimeService } from './services/conversation-realtime.service';

// Listeners
import { ConversationEventHandler } from './listeners/conversation-event.handler';

// Controller & Gateway
import { ConversationController } from './conversation.controller';
import { ConversationGateway } from './conversation.gateway';

/**
 * ConversationModule
 *
 * Owns:
 * - Conversation lifecycle (create direct/group)
 * - Membership management (add/remove/leave)
 * - Role management (admin transfer)
 * - Group settings and join requests
 *
 * Does NOT own:
 * - Message sending/receiving (MessageModule)
 * - Message receipts (MessageModule)
 *
 * Communication with MessageModule:
 * - Via events only (no direct service imports)
 */
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    EventEmitterModule,
    EventsModule,
    SharedModule,
    AuthorizationModule, // Provides InteractionGuard used in ConversationController
    PrivacyModule,
    forwardRef(() => SocketModule),
    IdempotencyModule,
  ],
  controllers: [ConversationController],
  providers: [
    // Services
    ConversationService,
    GroupService,
    GroupJoinService,
    ConversationRealtimeService,

    // Listeners
    ConversationEventHandler,

    // Gateway
    ConversationGateway,
  ],
  exports: [ConversationService, GroupService, GroupJoinService],
})
export class ConversationModule { }
