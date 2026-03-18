// src/modules/conversation/conversation.module.ts

import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
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
import { SystemMessageBroadcasterService } from './services/system-message-broadcaster.service';
import { ConversationSystemMessageAdapter } from './internal-api/conversation-system-message.adapter';
import { CONVERSATION_SYSTEM_MESSAGE_PORT } from '@common/contracts/internal-api';

// Listeners
import { ConversationEventHandler } from './listeners/conversation-event.handler';
import { CallConversationListener } from './listeners/call-conversation.listener';
import { FriendshipConversationListener } from './listeners/friendship-conversation.listener';

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
    SocketModule,
    IdempotencyModule,
  ],
  controllers: [ConversationController],
  providers: [
    // Services
    ConversationService,
    GroupService,
    GroupJoinService,
    ConversationRealtimeService,
    SystemMessageBroadcasterService,
    ConversationSystemMessageAdapter,
    {
      provide: CONVERSATION_SYSTEM_MESSAGE_PORT,
      useExisting: ConversationSystemMessageAdapter,
    },

    // Listeners
    ConversationEventHandler,
    CallConversationListener, // CALL PHASE 1: Update conversation on call.ended
    FriendshipConversationListener, // Auto-create conversation on friendship.accepted

    // Gateway
    ConversationGateway,
  ],
  exports: [
    ConversationService,
    GroupService,
    GroupJoinService,
    SystemMessageBroadcasterService,
    CONVERSATION_SYSTEM_MESSAGE_PORT,
  ],
})
export class ConversationModule { }
