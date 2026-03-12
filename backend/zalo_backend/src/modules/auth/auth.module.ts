import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { DeviceFingerprintService } from './services/device-fingerprint.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { UsersModule } from '../users/users.module';
import jwtConfig from '../../config/jwt.config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { IdempotencyModule } from '@common/idempotency/idempotency.module';
import { SecurityEventHandler } from './listeners/security-event.handler';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // Configuration handled in strategies
    ConfigModule.forFeature(jwtConfig),
    UsersModule,
    EventEmitterModule,
    IdempotencyModule, // ✅ PHASE 3.3: Idempotency tracking for event handlers
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    DeviceFingerprintService,
    JwtStrategy,
    JwtRefreshStrategy,
    // PHASE 3 Action 3.2: Event listener for security-related events
    // PHASE 3.3: Enhanced with idempotency tracking
    SecurityEventHandler,
  ],
  exports: [AuthService, TokenService, DeviceFingerprintService],
})
export class AuthModule { }
