// src/modules/media/controllers/media-upload.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from 'src/common/decorator/customize';
import { MediaUploadService } from './services/media-upload.service';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto.ts';

@Controller('media/upload')
// @UseGuards(JwtAuthGuard)
export class MediaUploadController {
  constructor(private readonly mediaUploadService: MediaUploadService) {}

  /**
   * Initiate upload - Get presigned URL
   * Rate limit: 10 requests per minute per user
   */
  @Post('initiate')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10/min
  @HttpCode(HttpStatus.OK)
  async initiateUpload(
    @CurrentUser('id') userId: string,
    @Body() dto: InitiateUploadDto,
  ) {
    return this.mediaUploadService.initiateUpload(userId, dto);
  }

  /**
   * Confirm upload after client uploads to S3
   */
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirmUpload(
    @CurrentUser('id') userId: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    return this.mediaUploadService.confirmUpload(userId, dto.uploadId);
  }
}
