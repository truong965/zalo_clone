// src/modules/media/media.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { MediaUploadController } from './media.controller';
import { MediaUploadService } from './services/media-upload.service';
import { S3Service } from './services/s3.service';
import { FileValidationService } from './services/file-validation.service';

import s3Config from 'src/config/s3.config.ts';
import uploadConfig from '../../config/upload.config';
import { BullModule } from '@nestjs/bull';
import { PrismaService } from 'src/database/prisma.service';
import { MetricsService } from './services/metrics.service';
import { ImageProcessorService } from './processors/image.processor';
import { VideoProcessorService } from './processors/video.processor';
import {
  MEDIA_QUEUE_NAME,
  MediaQueueService,
} from './queues/media-queue.service';
import { MediaConsumer } from './queues/media.consumer';
import { MediaProgressGateway } from './gateways/media-progress.gateway';
// import { S3CleanupService } from './services/s3-cleanup.service';

@Module({
  imports: [
    ConfigModule.forFeature(s3Config),
    ConfigModule.forFeature(uploadConfig),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 10, // 10 requests
      },
    ]),
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

    // Processors
    ImageProcessorService,
    VideoProcessorService,

    // Queue
    MediaQueueService,
    // MediaConsumer,

    // WebSocket
    MediaProgressGateway,
    ...(process.env.TEST_MODE === 'e2e_client' ? [] : [MediaConsumer]),
  ],
  exports: [MediaUploadService, S3Service, MediaQueueService],
})
export class MediaModule {}
