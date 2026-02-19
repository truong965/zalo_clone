// src/modules/media/media.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { MediaUploadController } from './media.controller';
import { MediaUploadService } from './services/media-upload.service';
import { S3Service } from './services/s3.service';
import { FileValidationService } from './services/file-validation.service';
import { S3CleanupService } from './services/s3.cleanup.service';

import s3Config from 'src/config/s3.config.ts';
import uploadConfig from '../../config/upload.config';
import jwtConfig from 'src/config/jwt.config';
import queueConfig from 'src/config/queue.config';
import { BullModule } from '@nestjs/bull';
import { PrismaService } from 'src/database/prisma.service';
import { MetricsService } from './services/metrics.service';
import { ImageProcessorService } from './processors/image.processor';
import { VideoProcessorService } from './processors/video.processor';
import {
  MEDIA_QUEUE_NAME,
  MediaQueueService,
} from './queues/media-queue.service';
import { SqsMediaQueueService } from './queues/sqs-media-queue.service';
import { MediaConsumer } from './queues/media.consumer';
import { SqsMediaConsumer } from './queues/sqs-media.consumer';
import { MediaProgressGateway } from './gateways/media-progress.gateway';
import { MEDIA_QUEUE_PROVIDER } from './queues/media-queue.interface';

const IS_SQS = process.env.QUEUE_PROVIDER === 'sqs';
const IS_TEST = process.env.TEST_MODE === 'e2e_client';

@Module({
  imports: [
    ConfigModule.forFeature(s3Config),
    ConfigModule.forFeature(uploadConfig),
    ConfigModule.forFeature(jwtConfig),
    ConfigModule.forFeature(queueConfig),
    EventEmitterModule, // Global module — re-imported here for explicit documentation
    JwtModule.register({}), // secret injected per-call via jwtConfig
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 10, // 10 requests
      },
    ]),
    // Bull queue registration — skipped entirely when using SQS
    ...(IS_SQS
      ? []
      : [
        BullModule.registerQueueAsync({
          name: MEDIA_QUEUE_NAME,
          useFactory: (configService: ConfigService) => ({
            redis: {
              host: configService.get('queue.redis.host'),
              port: configService.get('queue.redis.port'),
              password: configService.get('queue.redis.password'),
              db: configService.get('queue.redis.db'),
            },
            defaultJobOptions: {
              removeOnComplete: configService.get('queue.jobRetention.completed'),
              removeOnFail: configService.get('queue.jobRetention.failed'),
            },
          }),
          inject: [ConfigService],
        }),
      ]),
  ],
  controllers: [MediaUploadController],
  providers: [
    // Database
    PrismaService,

    // Core Services
    MediaUploadService,
    S3Service,
    FileValidationService,
    MetricsService,
    S3CleanupService,

    // Processors
    ImageProcessorService,
    VideoProcessorService,

    // Queue provider — abstract token used by MediaUploadService
    {
      provide: MEDIA_QUEUE_PROVIDER,
      useClass: IS_SQS ? SqsMediaQueueService : MediaQueueService,
    },
    // Concrete class also registered so MetricsService (Bull-only) can inject it
    ...(IS_SQS ? [SqsMediaQueueService] : [MediaQueueService]),

    // WebSocket
    MediaProgressGateway,

    // Consumer — Bull or SQS, skipped in e2e test client mode
    ...(IS_TEST
      ? []
      : IS_SQS
        ? [SqsMediaConsumer]
        : [MediaConsumer]),
  ],
  exports: [
    MediaUploadService,
    S3Service,
    MEDIA_QUEUE_PROVIDER,
    // Export concrete class too so callers can use strongly-typed injection
    ...(IS_SQS ? [SqsMediaQueueService] : [MediaQueueService]),
  ],
})
export class MediaModule { }
