import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { DatabaseModule } from './database/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RedisModule } from './modules/redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { SocketModule } from './socket/socket.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { MessageModule } from './modules/message/message.module';
import { MediaModule } from './modules/media/media.module';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter'; // [CRITICAL IMPORT]

// Shared Services & Guards (Cross-Module)
import { SharedModule } from './shared/shared.module';

// Feature Modules (Refactored)
import { BlockModule } from './modules/block/block.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { CallModule } from './modules/call/call.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { FriendshipModule } from './modules/friendship/friendship.module';
import { ContactModule } from './modules/contact/contact.module';
import { EventPersistenceModule } from './common/events/event-persistence.module';
import { SearchEngineModule } from './modules/search_engine/search_engine.module';

// Configs
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import socketConfig from './config/socket.config';
import s3Config from './config/s3.config';
import uploadConfig from './config/upload.config';
import queueConfig from './config/queue.config';
import socialConfig from './config/social.config';

@Module({
  imports: [
    // ========================================================================
    // 1. INFRASTRUCTURE & CONFIGURATION
    // ========================================================================
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        jwtConfig,
        redisConfig,
        socketConfig,
        s3Config,
        queueConfig,
        uploadConfig,
        socialConfig, // [CHECKED] Đã load config social
      ],
      envFilePath: '.env.development.local',
    }),

    // [CRITICAL FIX] Khởi tạo Event Emitter Global
    // Nếu thiếu cái này, @OnEvent trong SocialListener sẽ không chạy
    EventEmitterModule.forRoot({
      global: true,
      wildcard: true, // Cho phép lắng nghe event pattern (vd: 'user.*')
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),

    // Async Queue — Bull (Redis) for local dev, skipped when QUEUE_PROVIDER=sqs
    ...(process.env.QUEUE_PROVIDER !== 'sqs'
      ? [
        BullModule.forRootAsync({
          useFactory: (configService: ConfigService) => ({
            redis: {
              host: configService.get('queue.redis.host'),
              port: configService.get('queue.redis.port'),
              password: configService.get('queue.redis.password'),
            },
          }),
          inject: [ConfigService],
        }),
      ]
      : []),

    // Cron Jobs
    ScheduleModule.forRoot(),

    // Context Local Storage (User Session tracking)
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),

    // ========================================================================
    // 2. CORE MODULES
    // ========================================================================
    DatabaseModule,
    RedisModule,
    SocketModule, // Socket Gateway

    // ========================================================================
    // 3. SHARED SERVICES & GUARDS (Cross-Module Usage)
    // ========================================================================
    SharedModule, // Authorization & Guards (InteractionAuthorizationService, NotBlockedGuard)

    // ========================================================================
    // 4. FEATURE MODULES
    // ========================================================================
    // IAM (Identity & Access Management)
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,

    // Communication Core
    ConversationModule, // NEW: Conversation domain module
    MessageModule, // NEW: Message domain module
    MediaModule,

    // PHASE 6: Domain Event Persistence (audit trail)
    EventPersistenceModule,

    // [REFACTORED] Social Graph Components
    BlockModule,
    AuthorizationModule, // PHASE 2: canInteract, InteractionGuard
    // CallModule, // Phụ thuộc Social
    FriendshipModule, // PHASE 6: Standalone Friendship Module (Independent)
    PrivacyModule, SearchEngineModule, // Privacy settings & permissions (Independent)

    // Utilities
    // HealthModule,
    // ContactModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule { }
