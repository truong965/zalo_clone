/**
 * NotificationsModule — Push notification infrastructure (Phase 5).
 *
 * Owns:
 * - Firebase Admin SDK lifecycle (FirebaseService)
 * - Device token CRUD (DeviceTokenService + DeviceTokenController)
 * - Push notification orchestration (PushNotificationService)
 * - Event listeners for push notifications (CallNotificationListener, MessageNotificationListener, FriendshipNotificationListener, GroupNotificationListener)
 * - Redis-based notification batching (NotificationBatchService)
 * - Conversation member cache for notification decisions (ConversationMemberCacheService)
 *
 * Event-driven: Domain modules emit events → Notification listeners react.
 * No imports from domain modules (zero coupling).
 *
 * Exports PushNotificationService for potential direct use by other modules
 * (but prefer event-driven communication).
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DatabaseModule } from '@database/prisma.module';
import firebaseConfig from '@config/firebase.config';

// Services
import { FirebaseService } from './services/firebase.service';
import { DeviceTokenService } from './services/device-token.service';
import { PushNotificationService } from './services/push-notification.service';
import { NotificationBatchService } from './services/notification-batch.service';
import { ConversationMemberCacheService } from './services/conversation-member-cache.service';

// Controllers
import { DeviceTokenController } from './controllers/device-token.controller';

// Listeners
import { CallNotificationListener } from './listeners/call-notification.listener';
import { MessageNotificationListener } from './listeners/message-notification.listener';
import { FriendshipNotificationListener } from './listeners/friendship-notification.listener';
import { GroupNotificationListener } from './listeners/group-notification.listener';

@Module({
      imports: [
            ConfigModule.forFeature(firebaseConfig),
            DatabaseModule,
            EventEmitterModule,
      ],
      controllers: [DeviceTokenController],
      providers: [
            // Core services
            FirebaseService,
            DeviceTokenService,
            PushNotificationService,
            NotificationBatchService,
            ConversationMemberCacheService,
            // Event listeners
            CallNotificationListener,
            MessageNotificationListener,
            FriendshipNotificationListener,
            GroupNotificationListener,
      ],
      exports: [PushNotificationService, DeviceTokenService],
})
export class NotificationsModule { }
