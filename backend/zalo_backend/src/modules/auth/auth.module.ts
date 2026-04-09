import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { DeviceFingerprintService } from './services/device-fingerprint.service';
import { DeviceService } from './services/device.service';
import { DeviceController } from './device.controller';
import { TwoFactorService } from './services/two-factor.service';
import { TwoFactorController } from './two-factor.controller';
import { GoogleAuthenticatorProvider } from './providers/google-authenticator.provider';
import { GeoIpService } from './services/geo-ip.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import jwtConfig from '../../config/jwt.config';
import securityConfig from '../../config/security.config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { IdempotencyModule } from '@common/idempotency/idempotency.module';
import { SecurityEventHandler } from './listeners/security-event.handler';

// Phase 1-6: QR Login & Device Management
import { QrLoginController } from './qr-login.controller';
import { QrLoginService } from './services/qr-login.service';
import { QrSessionRedisService } from './services/qr-session-redis.service';
import { QrLoginSocketListener } from './listeners/qr-login-socket.listener';
import { RedisModule } from 'src/shared/redis/redis.module';
import { MailModule } from 'src/shared/mail/mail.module';
import { TelegramSmsProvider } from './providers/telegram-sms.provider';
import { SpeedSmsProvider } from './providers/speedsms.provider';
import { ConfigService } from '@nestjs/config';
import { DeviceFingerprintModule } from './device-fingerprint.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // Configuration handled in strategies
    ConfigModule.forFeature(jwtConfig),
    ConfigModule.forFeature(securityConfig),
    UsersModule,
    NotificationsModule,
    EventEmitterModule,
    IdempotencyModule, // ✅ PHASE 3.3: Idempotency tracking for event handlers
    RedisModule, // Needed for RedisRegistryService in AuthService.getSessions
    MailModule,
    DeviceFingerprintModule,
  ],
  controllers: [AuthController, QrLoginController, DeviceController, TwoFactorController],
  providers: [
    AuthService,
    TokenService,
    DeviceService,
    TwoFactorService,
    {
      provide: 'TOTP_PROVIDER',
      useClass: GoogleAuthenticatorProvider,
    },
    QrLoginService,
    QrSessionRedisService,
    JwtStrategy,
    JwtRefreshStrategy,
    // PHASE 3 Action 3.2: Event listener for security-related events
    // PHASE 3.3: Enhanced with idempotency tracking
    SecurityEventHandler,
    QrLoginSocketListener,
    {
      provide: 'SMS_PROVIDER',
      useFactory: (configService: ConfigService) => {
        const type = configService.get<string>('SMS_PROVIDER_TYPE') || 'TELEGRAM';
        return type === 'SPEEDSMS'
          ? new SpeedSmsProvider(configService)
          : new TelegramSmsProvider(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: [AuthService, TokenService, DeviceFingerprintModule],
})
export class AuthModule {}
