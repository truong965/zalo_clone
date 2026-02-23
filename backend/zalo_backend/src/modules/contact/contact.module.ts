import { Module } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';
import { FriendshipModule } from '../friendship/friendship.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { ContactCacheListener } from './listeners/contact-cache.listener';

@Module({
  imports: [
    FriendshipModule, // Cung cấp FriendshipService
    PrivacyModule, // Cung cấp PrivacyService
  ],
  controllers: [ContactController],
  providers: [
    ContactService,
    ContactCacheListener, // P3.4: cache invalidation on alias change / contact removal
  ],
  exports: [ContactService], // Export cho call-history, conversation, search modules
})
export class ContactModule { }

