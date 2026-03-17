import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptor/transform.interceptor';
import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { RedisIoAdapter } from './socket/adapters/redis-io.adapter';
import { ConfigService } from '@nestjs/config';
import { setupInternalRouting } from './common/middleware/internal-routing.middleware';
async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const port = process.env.PORT || 3000;

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const rawOrigins = configService.get<string>('CORS_ORIGINS') || '';

  // 2. Chuyển đổi thành Array chuẩn để NestJS tự động xử lý logic trả về 1 origin
  const allowedOrigins = rawOrigins.split(',').map((origin) => origin.trim());

  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new TransformInterceptor(reflector));
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector));
  //Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Tự động loại bỏ các field không khai báo trong DTO
      forbidNonWhitelisted: true, // Báo lỗi nếu gửi field thừa
      transform: true, // Kích hoạt class-transformer để chạy @Transform
      transformOptions: {
        enableImplicitConversion: true, // Tự động convert type (VD: string '1' -> number 1)
      },
    }),
  );

  // ========================================================================
  // PHASE 5: Internal API Routing Setup
  // Register internal routes BEFORE applying global prefix
  // This allows /internal/* routes to exist without /api/v1 prefix
  // ========================================================================
  setupInternalRouting(app);

  // ========================================================================
  // ROUTING CONFIGURATION: Public API vs Internal Routes
  // ========================================================================
  // Public API uses global prefix: /api/v1/*
  // Internal API uses separate prefix: /internal/*
  //
  // This separation allows:
  // - Internal routes to be protected differently (InternalAuthGuard instead of JWT)
  // - Clear distinction between public and internal APIs
  // - Future API Gateway can route these differently
  // ========================================================================

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI, //v
    defaultVersion: ['1'], //v1
  });

  //Security headers
  app.use(helmet());
  //cookie parser (required for refresh token
  app.use(cookieParser());
  //CORS configuration
  app.enableCors({
    origin: allowedOrigins,
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Device-Name',
      'X-Device-Type',
      'X-Platform',
      'X-Screen-Resolution',
      'X-Timezone',
    ],
  });
  // --- CẤU HÌNH SOCKET ADAPTER ---
  const redisIoAdapter = new RedisIoAdapter(app);
  app.useWebSocketAdapter(redisIoAdapter);

  //Swagger documentation
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Zalo Clone API')
      .setDescription('OTT Messaging Application API Documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('refresh_token')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port);
  logger.log(`🚀 Application is running on: http://localhost:${port}/api/v1`);
  logger.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  logger.log(`🏥 Health Check: http://localhost:${port}/api/v1/health`);
  logger.log(`🔌 Socket.IO: ws://localhost:${port}/socket.io`);
}
bootstrap();
