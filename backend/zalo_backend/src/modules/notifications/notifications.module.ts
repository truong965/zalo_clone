/**
 * NotificationsModule — Push notification infrastructure (Phase 5).
 *
 * Owns:
 * - Firebase Admin SDK lifecycle (FirebaseService)
 * - Device token CRUD (DeviceTokenService + DeviceTokenController)
 * - Push notification orchestration (PushNotificationService)
 * - Event listeners for call push notifications (CallNotificationListener)
 *
 * Event-driven: CallModule emits events → CallNotificationListener reacts.
 * No imports from CallModule (zero coupling).
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

// Controllers
import { DeviceTokenController } from './controllers/device-token.controller';

// Listeners
import { CallNotificationListener } from './listeners/call-notification.listener';

@Module({
      imports: [
            ConfigModule.forFeature(firebaseConfig),
            DatabaseModule,
            EventEmitterModule,
      ],
      controllers: [DeviceTokenController],
      providers: [
            FirebaseService,
            DeviceTokenService,
            PushNotificationService,
            CallNotificationListener,
      ],
      exports: [PushNotificationService, DeviceTokenService],
})
export class NotificationsModule { }
