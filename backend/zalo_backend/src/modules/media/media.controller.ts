// src/modules/media/controllers/media-upload.controller.ts
import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorator/customize';
import { MediaUploadService } from './services/media-upload.service';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaUploadController {
  constructor(private readonly mediaUploadService: MediaUploadService) { }

  /**
   * Initiate upload - Get presigned URL
   * Rate limit: 10 requests per minute per user
   */
  @Post('upload/initiate')
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
  @Post('upload/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmUpload(
    @CurrentUser('id') userId: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    return this.mediaUploadService.confirmUpload(userId, dto.uploadId);
  }

  /**
   * Get media item status and metadata
   * Used by frontend to poll PROCESSING → PROCESSED transition
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getMedia(
    @CurrentUser('id') userId: string,
    @Param('id') mediaId: string,
  ) {
    return this.mediaUploadService.getMediaById(userId, mediaId);
  }

  /**
   * Delete a media item (removes DB record and S3 objects)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMedia(
    @CurrentUser('id') userId: string,
    @Param('id') mediaId: string,
  ) {
    await this.mediaUploadService.deleteMedia(userId, mediaId);
  }
}
