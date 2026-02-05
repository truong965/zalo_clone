import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SocketGateway } from './socket.gateway';
import { SocketAuthService } from './services/socket-auth.service';
import { SocketStateService } from './services/socket-state.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { RedisModule } from 'src/modules/redis/redis.module';
import socketConfig from 'src/config/socket.config';
import { DatabaseModule } from 'src/database/prisma.module';
import { SocketConnectionLoggerService } from './services/socket-connection-logger.service';
import { ScheduleModule } from '@nestjs/schedule';
import { SocketCleanupJob } from './jobs/socket-cleanup.job';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventsModule } from '@shared/events';

// PHASE 2: Event listener (instead of MessagingModule import)
import { SocketNotificationListener } from './listeners/socket-notification.listener';

/**
 * SocketModule (PHASE 2 - REFACTORED)
 *
 * BREAKING CHANGE: Removed forwardRef(() => MessagingModule)
 * WHY: SocketNotificationListener now listens to messaging events
 * EVENT_DRIVEN: Messaging emits events, SocketModule listens (no imports needed)
 *
 * RESULT: SocketModule ← MessagingModule coupling eliminated ✅
 *
 * Before:
 *   SocketGateway imports MessagingModule (via forwardRef)
 *   REASON: Needed to emit socket notifications when messages sent
 *   PROBLEM: Creates tight coupling
 *
 * After:
 *   SocketGateway has NO dependency on MessagingModule
 *   SocketNotificationListener listens to messaging events
 *   When message sent -> MessagingModule emits event -> SocketNotificationListener broadcasts
 *   Zero import coupling ✅
 */
@Module({
  imports: [
    ConfigModule.forFeature(socketConfig),
    JwtModule.register({}),
    RedisModule,
    DatabaseModule,
    ScheduleModule.forRoot(),
    EventEmitterModule, // PHASE 2: For event listeners
    EventsModule,
  ],
  providers: [
    SocketGateway,
    SocketAuthService,
    SocketStateService,
    WsJwtGuard,
    SocketConnectionLoggerService,
    SocketCleanupJob,

    // PHASE 2: Event listener (replaces forwardRef() to MessagingModule)
    SocketNotificationListener,
  ],
  exports: [SocketGateway, SocketStateService],
})
export class SocketModule {}
