import { Module, forwardRef } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Modules
import { BlockModule } from '../block/block.module';
import { CallModule } from '../call/call.module';

// Services
import { FriendshipService } from './service/friendship.service';
import { PrivacyService } from './service/privacy.service';
import { SocialFacade } from './social.facade';
import { ContactService } from './service/contact.service';

// Controllers
import { FriendshipsController } from './controller/friendships.controller';
import { ContactController } from './controller/contact.controller';
import { FriendRequestController } from './controller/friendRequest.controller'; // Đừng quên controller này
import { PrivacyController } from './controller/privacy.controller';

// Guards & Listeners
import { NotBlockedGuard } from './guards/social.guard';
import {
  CanCallGuard,
  CanMessageGuard,
  FriendsOnlyGuard,
} from './guards/social-permissions.guard.ts';
import { SocialGraphEventListener } from './listener/social-graph.listener';
import { SocketModule } from 'src/socket/socket.module';

@Module({
  imports: [
    RedisModule,
    EventEmitterModule,

    // 1. BlockModule (Không bị vòng lặp -> Import thẳng)
    BlockModule,

    // 2. CallModule (Bị vòng lặp -> Dùng forwardRef)
    forwardRef(() => CallModule),
    forwardRef(() => SocketModule),
  ],
  controllers: [
    FriendshipsController,
    ContactController,
    FriendRequestController,
    PrivacyController,
  ],
  providers: [
    FriendshipService,
    PrivacyService,
    ContactService,
    SocialFacade,

    // Guards
    NotBlockedGuard,
    CanMessageGuard,
    CanCallGuard,
    FriendsOnlyGuard,

    // Listener
    SocialGraphEventListener,
  ],
  exports: [
    SocialFacade,
    ContactService, // Export cho CallModule dùng
    FriendshipService, // Export nếu AuthModule hoặc ChatModule cần check bạn bè
    PrivacyService, // Export nếu ChatModule cần check quyền
    // Không cần export BlockService/CallHistoryService vì đã import Module tương ứng
  ],
})
export class SocialModule {}
