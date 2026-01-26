// src/modules/media/media.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { MediaUploadController } from './media.controller';
import { MediaUploadService } from './services/media-upload.service';
import { S3Service } from './services/s3.service';
import { FileValidationService } from './services/file-validation.service';

import s3Config from 'src/config/s3.config.ts';
import uploadConfig from '../../config/upload.config';

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
  ],
  controllers: [MediaUploadController],
  providers: [MediaUploadService, S3Service, FileValidationService],
  exports: [MediaUploadService, S3Service],
})
export class MediaModule {}
