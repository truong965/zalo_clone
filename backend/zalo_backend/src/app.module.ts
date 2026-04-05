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
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { RedisModule } from '@shared/redis/redis.module';
import { SocketModule } from './socket/socket.module';
import { ConversationModule } from './modules/conversation/conversation.module';
import { MessageModule } from './modules/message/message.module';
import { MediaModule } from './modules/media/media.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter'; // [CRITICAL IMPORT]
import { BullModule } from '@nestjs/bullmq';

// Shared Services & Guards (Cross-Module)
import { SharedModule } from './shared/shared.module';

// Feature Modules (Refactored)
import { BlockModule } from './modules/block/block.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { FriendshipModule } from './modules/friendship/friendship.module';
import { EventPersistenceModule } from './common/events/event-persistence.module';
import { SearchEngineModule } from './modules/search_engine/search_engine.module';
import { ContactModule } from './modules/contact/contact.module';
import { CallModule } from './modules/call/call.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReminderModule } from './modules/reminder/reminder.module';
import { AdminModule } from './modules/admin/admin.module';

// Configs
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import socketConfig from './config/socket.config';
import s3Config from './config/s3.config';
import uploadConfig from './config/upload.config';
import queueConfig from './config/queue.config';
import socialConfig from './config/social.config';
import workerConfig from './config/worker.config';
import mailConfig from './config/mail.config';
import aiConfig from './config/ai.config';
import { HealthModule } from './modules/health/health.module';
import { InternalModule } from './modules/internal/internal.module';
import { AiProxyModule } from './modules/ai-proxy/ai-proxy.module';
import { RequestContextModule } from './common/context/request-context.module';
import { RequestContextInterceptor } from './common/interceptor/request-context.interceptor';
import { TransformInterceptor } from './common/interceptor/transform.interceptor';
import { HttpExceptionFilter } from './common/filters';

const aiEnabled = process.env.AI_AGENT_ENABLED !== 'false';

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
        workerConfig,
        mailConfig,
        aiConfig,
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

    // Global rate-limiting (10req/min default; per-endpoint @Throttle overrides apply)
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Cron Jobs
    ScheduleModule.forRoot(),

    // BullMQ Infrastructure (Using AI-specific Redis instance)
    ...(aiEnabled
      ? [
        BullModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const aiRedis = config.get<any>('redis.ai');
            return {
              connection: {
                ...aiRedis
              },
            };
          },
        }),
      ]
      : []),

    // Context Local Storage (User Session tracking)
    // middleware.mount: true automatically mounts CLS middleware to all routes
    // This ensures CLS context is available for all HTTP requests
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req) => {
          // Ensure CLS context is initialized for this request
          if (!cls.getId()) {
            cls.set('requestId', req.headers['x-request-id'] || '');
          }
        },
      },
    }),

    // ========================================================================
    // 2. CORE MODULES
    // ========================================================================
    RequestContextModule,
    DatabaseModule,
    RedisModule,
    SocketModule, // Socket Gateway

    // ========================================================================
    // 3. SHARED SERVICES & GUARDS (Cross-Module Usage)
    // ========================================================================
    SharedModule, // DisplayNameResolver (cross-cutting utility; NotBlockedGuard + Auth now from AuthorizationModule)

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
    CallModule, // CALL PHASE 1: Call history + signaling gateway
    NotificationsModule, // PHASE 5: Push Notifications (FCM + Web Push)
    ReminderModule, // PHASE 4: Reminders (PostgreSQL polling scheduler)
    FriendshipModule, // PHASE 6: Standalone Friendship Module (Independent)
    PrivacyModule,
    SearchEngineModule, // Privacy settings & permissions (Independent)

    // Admin Panel (Phase 0: skeleton → Phase 1-2: full implementation)
    AdminModule,

    // Internal inter-service integration (for AI Agent)
    ...(aiEnabled ? [InternalModule, AiProxyModule] : []),

    // Utilities
    ContactModule,
    HealthModule, // [CRITICAL] Health Check Endpoint (/api/health)
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // === GLOBAL FILTERS ===
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },

    // === GLOBAL INTERCEPTORS ===
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ClassSerializerInterceptor,
    },

    // === GLOBAL GUARDS ===
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
