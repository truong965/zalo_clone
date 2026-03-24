// src/modules/message/message.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from 'src/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventsModule } from '@shared/events';
import { SharedModule } from '@shared/shared.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { SocketModule } from 'src/socket/socket.module';
import { ConversationModule } from '@modules/conversation/conversation.module';
import { IdempotencyModule } from '@common/idempotency/idempotency.module';
import s3Config from 'src/config/s3.config';

// Services
import { MessageService } from './services/message.service';
import { ReceiptService } from './services/receipt.service';
import { MessageQueueService } from './services/message-queue.service';
import { MessageBroadcasterService } from './services/message-broadcaster.service';
import { MessageRealtimeService } from './services/message-realtime.service';

// Listeners
import { MessagingBlockListener } from './listeners/messaging-block.listener';
import { CallMessageListener } from './listeners/call-message.listener';

// Controller & Gateway
import { MessageController } from './message.controller';
import { MessageGateway } from './message.gateway';

/**
 * MessageModule
 *
 * Owns:
 * - Message sending/receiving
 * - Message receipts (delivered/read)
 * - Message queue (offline messages)
 * - Message broadcasting (real-time delivery)
 *
 * Does NOT own:
 * - Conversation lifecycle (ConversationModule)
 * - Membership management (ConversationModule)
 *
 * Communication with ConversationModule:
 * - Via events only (no direct service imports)
 * - Membership checks via direct Prisma queries (read-only)
 */
@Module({
  imports: [
    ConfigModule.forFeature(s3Config),
    DatabaseModule,
    RedisModule,
    EventEmitterModule,
    EventsModule,
    SharedModule,
    AuthorizationModule,
    SocketModule,
    ConversationModule,
    IdempotencyModule,
  ],
  controllers: [MessageController],
  providers: [
    // Services
    MessageService,
    ReceiptService,
    MessageQueueService,
    MessageBroadcasterService,
    MessageRealtimeService,

    // Listeners
    // MSG-R6: Removed MessageBroadcasterListener and MessagingUserPresenceListener (stub-only, no business logic)
    MessagingBlockListener,
    CallMessageListener, // CALL PHASE 1: Create system message on call.ended

    // Gateway
    MessageGateway,
  ],
  exports: [
    MessageService,
    ReceiptService,
    MessageQueueService,
    MessageBroadcasterService,
  ],
})
export class MessageModule {}
