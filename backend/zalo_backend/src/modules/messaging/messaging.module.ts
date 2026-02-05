import { Module } from '@nestjs/common';
import { MessagingController } from './messaging.controller';
import { DatabaseModule } from 'src/database/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthorizationModule } from '@modules/authorization/authorization.module';
import { MessageService } from './services/message.service';
import { ConversationService } from './services/conversation.service';
import { ReceiptService } from './services/receipt.service';
import { MessageQueueService } from './services/message-queue.service';
import { MessageBroadcasterService } from './services/message-broadcaster.service';
import { MessagingGateway } from './messaging.gateway';
import { GroupService } from './services/group.service';
import { GroupJoinService } from './services/group-join.service';
import { EventEmitterModule } from '@nestjs/event-emitter';

// PHASE 2: Listeners (instead of direct service imports)
import { MessagingFriendshipListener } from './listeners/messaging-friendship.listener';
import { MessagingBlockListener } from './listeners/messaging-block.listener';
import { MessagingUserPresenceListener } from './listeners/messaging-user-presence.listener';

/**
 * MessagingModule (PHASE 2 - REFACTORED)
 *
 * BREAKING CHANGE #1: Removed forwardRef(() => SocketModule)
 * WHY: SocketNotificationListener in SocketModule now listens to MessageSentEvent
 * EVENT_DRIVEN: Services emit events, listeners react (no direct coupling)
 *
 * BREAKING CHANGE #2: Removed forwardRef(() => SocialModule)
 * WHY: MessagingFriendshipListener listens to friendship events
 * EVENT_DRIVEN: Automatically handles friendship changes without direct calls
 *
 * RESULT: Zero circular dependencies ✅
 */
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    EventEmitterModule,
    AuthorizationModule,
  ],
  providers: [
    // Services
    MessageService,
    ConversationService,
    ReceiptService,
    MessageQueueService,
    MessageBroadcasterService,
    GroupService,
    GroupJoinService,

    // Gateway
    MessagingGateway,

    // PHASE 2: Event Listeners (instead of direct imports)
    MessagingFriendshipListener,      // Listen to SocialModule events
    MessagingBlockListener,            // Listen to BlockModule events
    MessagingUserPresenceListener,     // Listen to SocketModule events (user connected/disconnected)
  ],
  controllers: [MessagingController],
  exports: [
    MessageService,
    ConversationService,
    ReceiptService,
    MessagingGateway,
    GroupService,
    GroupJoinService,
  ],
})
export class MessagingModule {}
