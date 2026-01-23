import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SocketGateway } from './socket.gateway';
import { SocketAuthService } from './services/socket-auth.service';
import { SocketStateService } from './services/socket-state.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { RedisModule } from 'src/modules/redis/redis.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import socketConfig from 'src/config/socket.config';
import { DatabaseModule } from 'src/database/prisma.module';
import { SocketConnectionLoggerService } from './services/socket-connection-logger.service';
import { ScheduleModule } from '@nestjs/schedule';
import { SocketCleanupJob } from './jobs/socket-cleanup.job';

@Module({
  imports: [
    ConfigModule.forFeature(socketConfig),
    JwtModule.register({}), // Config handled by strategies
    RedisModule,
    AuthModule, // For DeviceFingerprintService
    DatabaseModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    SocketGateway,
    SocketAuthService,
    SocketStateService,
    WsJwtGuard,
    SocketConnectionLoggerService,
    SocketCleanupJob,
  ],
  exports: [SocketGateway, SocketStateService],
})
export class SocketModule {}
