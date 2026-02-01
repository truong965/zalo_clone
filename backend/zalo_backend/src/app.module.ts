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
import { MessagingModule } from './modules/messaging/messaging.module';
import { MediaModule } from './modules/media/media.module';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import socketConfig from './config/socket.config';
import s3Config from './config/s3.config.ts';
import uploadConfig from './config/upload.config';
import queueConfig from './config/queue.config';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { SocialModule } from './modules/social/social.module';
import socialConfig from './config/social.config';
@Module({
  imports: [
    // config schedule and cron jobs
    // ScheduleModule.forRoot(),
    // ThrottlerModule.forRoot({
    //   throttlers: [
    //     {
    //       ttl: 60000,
    //       limit: 10,
    //     },
    //   ],
    // }),

    ConfigModule.forRoot({
      isGlobal: true,
      // CHỈ ĐỊNH FILE ENV TẠI ĐÂY
      load: [
        jwtConfig,
        redisConfig,
        socketConfig,
        s3Config,
        queueConfig,
        uploadConfig,
        socialConfig,
      ],
      envFilePath: '.env.development.local',
    }),

    // Bull (Global)
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

    // Scheduler (for metrics collection)
    ScheduleModule.forRoot(),

    // cls to share context data (like userId) across the request lifecycle
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true }, // Tự động gắn middleware
    }),
    // Core modules
    DatabaseModule,
    RedisModule,

    // Feature modules
    RolesModule,
    PermissionsModule,
    UsersModule,
    AuthModule,
    HealthModule,
    SocketModule,
    MessagingModule,
    MediaModule,
    SocialModule,
    // public file
    // ServeStaticModule.forRoot({
    //   rootPath: join(__dirname, '..', 'public'), // Trỏ đến thư mục public ở root dự án
    //   exclude: ['/api/(.*)'], // Quan trọng: Đảm bảo nó không chặn các route API của bạn
    // }),
    // AuthModule,
    // UsersModule,
    // ChatModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // {
    //   provide: APP_GUARD,
    //   useClass: PermissionsGuard,
    // },
    // {
    //   provide: APP_GUARD,
    //   useClass: ThrottlerGuard,
    // },
  ],
})
export class AppModule {}
