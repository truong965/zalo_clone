import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';
import { FriendshipModule } from '../friendship/friendship.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContactCacheListener } from './listeners/contact-cache.listener';
import { ContactNotificationListener } from './listeners/contact-notification.listener';
import { CONTACT_SYNC_QUEUE } from './contact.constants';
import { ContactSyncProcessor } from './processors/contact-sync.processor'; 

@Module({
  imports: [
    FriendshipModule,
    PrivacyModule,
    NotificationsModule,
    BullModule.registerQueue({
      name: CONTACT_SYNC_QUEUE,
      // @ts-ignore - Some versions of NestJS BullMQ use a slightly different structure for worker configs
      processors: [{ concurrency: 5 }],
    }),
  ],
  controllers: [ContactController],
  providers: [
    ContactService,
    ContactCacheListener,
    ContactNotificationListener,
    ContactSyncProcessor,
  ],
  exports: [ContactService], // Export cho call-history, conversation, search modules
})
export class ContactModule {}
