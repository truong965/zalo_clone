import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { DatabaseModule } from './database/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
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
      envFilePath: '.env.development.local',
    }),

    // cls to share context data (like userId) across the request lifecycle
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true }, // Tự động gắn middleware
    }),

    RolesModule,

    PermissionsModule,
    DatabaseModule,
    UsersModule,
    AuthModule,
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
