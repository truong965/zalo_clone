import { forwardRef, Module } from '@nestjs/common';
import { MessagingController } from './messaging.controller';
import { DatabaseModule } from 'src/database/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { SocketModule } from 'src/socket/socket.module';
import { MessageService } from './services/message.service';
import { ConversationService } from './services/conversation.service';
import { ReceiptService } from './services/receipt.service';
import { MessageQueueService } from './services/message-queue.service';
import { MessageBroadcasterService } from './services/message-broadcaster.service';
import { MessagingGateway } from './messaging.gateway';
import { GroupService } from './services/group.service';
import { GroupJoinService } from './services/group-join.service';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    forwardRef(() => SocketModule), // For SocketStateService
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
  ],
  controllers: [MessagingController],
  exports: [
    MessageService,
    ConversationService,
    ReceiptService,
    MessagingGateway, // Export for integration with SocketGateway
    GroupService,
    GroupJoinService,
  ],
})
export class MessagingModule {}
