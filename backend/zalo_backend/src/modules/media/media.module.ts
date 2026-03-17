// src/modules/media/media.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MediaController } from './media.controller';
import { MediaUploadService } from './services/media-upload.service';
import { S3Service } from './services/s3.service';
import { S3CleanupService } from './services/s3-cleanup.service';

import s3Config from 'src/config/s3.config';
import uploadConfig from '../../config/upload.config';
import queueConfig from 'src/config/queue.config';
import { MetricsService } from './services/metrics.service';
import { SqsMediaQueueService } from './queues/sqs-media-queue.service';
import { SqsClientFactory } from './queues/sqs-client.factory';
import { MEDIA_QUEUE_PROVIDER } from './queues/media-queue.interface';
import { SocketModule } from 'src/socket/socket.module';
import { MediaInternalController } from './controllers/media-internal.controller';
import workerConfig from 'src/config/worker.config';

@Module({
  imports: [
    ConfigModule.forFeature(s3Config),
    ConfigModule.forFeature(uploadConfig),
    ConfigModule.forFeature(queueConfig),
    ConfigModule.forFeature(workerConfig),
    SocketModule, // Provides SocketGateway for real-time progress events
  ],
  controllers: [MediaController, MediaInternalController],
  providers: [
    // Core Services
    MediaUploadService,
    S3Service,
    MetricsService,
    S3CleanupService,

    // Shared SQS client (no-op when using Bull)
    SqsClientFactory,

    // Queue provider — abstract token used by MediaUploadService
    {
      provide: MEDIA_QUEUE_PROVIDER,
      useClass: SqsMediaQueueService,
    },
    // Concrete class also registered so MetricsService can inject it
    SqsMediaQueueService,
  ],
  exports: [MediaUploadService, S3Service, MEDIA_QUEUE_PROVIDER],
})
export class MediaModule {}
