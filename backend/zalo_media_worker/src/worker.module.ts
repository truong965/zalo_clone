// src/worker.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ClsModule } from 'nestjs-cls';

import uploadConfig from './config/upload.config';
import s3Config from './config/s3.config';
import queueConfig from './config/queue.config';
import workerConfig from './config/worker.config';

import { PrismaService } from './database/prisma.service';
import { S3Service } from './services/s3.service';
import { FileValidationService } from './services/file-validation.service';
import { ApiNotifierService } from './services/api-notifier.service';

import { ImageProcessor } from './processors/image.processor';
import { VideoProcessor } from './processors/video.processor';

import { SqsClientFactory } from './queues/sqs-client.factory';
import { SqsMediaConsumer } from './queues/sqs-media.consumer';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [uploadConfig, s3Config, queueConfig, workerConfig],
    }),
    EventEmitterModule.forRoot(),
    // CLS for background job context (jobs run outside HTTP middleware)
    ClsModule.forRoot({
      global: true,
      middleware: { mount: false }, // No HTTP middleware in worker
    }),
  ],
  providers: [
    PrismaService,
    S3Service,
    FileValidationService,
    ApiNotifierService,
    ImageProcessor,
    VideoProcessor,
    SqsClientFactory,
    SqsMediaConsumer,
  ],
})
export class WorkerModule { }

