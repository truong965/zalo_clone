import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';

// Services
import { FriendshipService } from './service/friendship.service';
import { BlockService } from './service/block.service';
import { PrivacyService } from './service/privacy.service';
import { SocialFacade } from './social.facade';
import { CallHistoryService } from './service/call-history.service';
import { ContactService } from './service/contact.service';
import { NotBlockedGuard } from './guards/social.guard';
import {
  CanCallGuard,
  CanMessageGuard,
  FriendsOnlyGuard,
} from './guards/can-message-guard';
import { SocialGraphEventListener } from './listener/social-graph.listener';
import { FriendshipsController } from './controller/friendships.controller';
import { ContactController } from './controller/contact.controller';
import { CallHistoryController } from './controller/call-history.controller';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    RedisModule,
    // Import các module khác nếu cần (ví dụ NotificationModule)
    EventEmitterModule,
  ],
  controllers: [
    FriendshipsController,
    ContactController,
    CallHistoryController,
  ],
  providers: [
    FriendshipService,
    BlockService,
    PrivacyService,
    SocialFacade,
    ContactService,
    CallHistoryService,

    NotBlockedGuard, // ← ADD
    CanMessageGuard, // ← ADD
    CanCallGuard, // ← ADD
    FriendsOnlyGuard,
    SocialGraphEventListener, // ← ADD
  ],
  exports: [
    // Chỉ export Facade để các module bên ngoài (Chat, Call) sử dụng.
    // Giấu kín các Service con để đảm bảo Encapsulation.
    SocialFacade,

    // Tuy nhiên, nếu bạn muốn dùng trực tiếp service ở đâu đó đặc biệt,
    // có thể export, nhưng khuyên dùng Facade.
    FriendshipService,
    BlockService,
    PrivacyService,
    ContactService, // ← ADD
    CallHistoryService,
    NotBlockedGuard,
    CanMessageGuard,
    CanCallGuard,
    FriendsOnlyGuard,
  ],
})
export class SocialModule {}
