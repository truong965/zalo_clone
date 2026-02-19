// src/modules/media/media.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MediaController } from './media.controller';
import { MediaUploadService } from './services/media-upload.service';
import { S3Service } from './services/s3.service';
import { FileValidationService } from './services/file-validation.service';
import { S3CleanupService } from './services/s3-cleanup.service';

import s3Config from 'src/config/s3.config';
import uploadConfig from '../../config/upload.config';
import queueConfig from 'src/config/queue.config';
import { BullModule } from '@nestjs/bull';
import { MetricsService } from './services/metrics.service';
import { ImageProcessor } from './processors/image.processor';
import { VideoProcessor } from './processors/video.processor';
import {
  MEDIA_QUEUE_NAME,
  MediaQueueService,
} from './queues/media-queue.service';
import { SqsMediaQueueService } from './queues/sqs-media-queue.service';
import { SqsClientFactory } from './queues/sqs-client.factory';
import { MediaConsumer } from './queues/media.consumer';
import { SqsMediaConsumer } from './queues/sqs-media.consumer';
import { MEDIA_QUEUE_PROVIDER } from './queues/media-queue.interface';
import { SocketModule } from 'src/socket/socket.module';

const IS_SQS = process.env.QUEUE_PROVIDER === 'sqs';

@Module({
  imports: [
    ConfigModule.forFeature(s3Config),
    ConfigModule.forFeature(uploadConfig),
    ConfigModule.forFeature(queueConfig),
    SocketModule, // Provides SocketGateway for real-time progress events
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
  controllers: [MediaController],
  providers: [
    // Core Services
    MediaUploadService,
    S3Service,
    FileValidationService,
    MetricsService,
    S3CleanupService,

    // Processors
    ImageProcessor,
    VideoProcessor,

    // Shared SQS client (no-op when using Bull)
    SqsClientFactory,

    // Queue provider — abstract token used by MediaUploadService
    {
      provide: MEDIA_QUEUE_PROVIDER,
      useClass: IS_SQS ? SqsMediaQueueService : MediaQueueService,
    },
    // Concrete class also registered so MetricsService (Bull-only) can inject it
    ...(IS_SQS ? [SqsMediaQueueService] : [MediaQueueService]),

    // Consumer — Bull or SQS
    ...(IS_SQS ? [SqsMediaConsumer] : [MediaConsumer]),
  ],
  exports: [
    MediaUploadService,
    S3Service,
    MEDIA_QUEUE_PROVIDER,
  ],
})
export class MediaModule { }
