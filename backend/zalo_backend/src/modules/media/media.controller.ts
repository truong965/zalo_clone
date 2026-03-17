// src/modules/media/media.controller.ts
import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CurrentUser, Public } from 'src/common/decorator/customize';
import { MediaUploadService } from './services/media-upload.service';
import { InitiateUploadDto, AvatarUploadDto } from './dto/initiate-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaUploadService: MediaUploadService) {}

  /**
   * Initiate upload - Get presigned URL
   * Rate limit: 10 requests per minute per user
   */
  @ApiOperation({ summary: 'Initiate upload — returns a presigned S3 PUT URL' })
  @Post('upload/initiate')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10/min
  @HttpCode(HttpStatus.OK)
  async initiateUpload(
    @CurrentUser('id') userId: string,
    @Body() dto: InitiateUploadDto,
  ) {
    return this.mediaUploadService.initiateUpload(userId, dto);
  }

  /**
   * Avatar upload — returns a presigned PUT URL + the final CloudFront/S3 URL.
   * Avatars bypass the media worker pipeline (no MediaAttachment record).
   * Flow: POST here → PUT file to presignedUrl → store fileUrl as avatarUrl.
   */
  @ApiOperation({
    summary: 'Get presigned URL for avatar upload (bypasses media pipeline)',
  })
  @Post('upload/avatar')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5/min
  @HttpCode(HttpStatus.OK)
  async avatarUpload(
    @CurrentUser('id') userId: string,
    @Body() dto: AvatarUploadDto,
  ) {
    return this.mediaUploadService.avatarUpload(userId, dto);
  }

  /**
   * Confirm upload after client uploads to S3
   */
  @ApiOperation({
    summary: 'Confirm upload after client has PUT the file to S3',
  })
  @Post('upload/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmUpload(
    @CurrentUser('id') userId: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    return this.mediaUploadService.confirmUpload(userId, dto.uploadId);
  }

  /**
   * Serve media file via presigned URL redirect.
   * Public endpoint — used as <img src> / <video src> / <a href> in the browser.
   * @param variant  "original" | "thumbnail" | "optimized" (default: original)
   */
  @ApiOperation({
    summary:
      'Redirect to presigned CDN URL for media playback (public, no auth required)',
  })
  @ApiParam({ name: 'id', description: 'Media attachment ID' })
  @ApiQuery({
    name: 'v',
    required: false,
    description: 'Variant: original | thumbnail | optimized',
  })
  @Public()
  @Get('serve/:id')
  async serveMedia(
    @Param('id') mediaId: string,
    @Query('v') variant: string = 'original',
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.mediaUploadService.getServeUrl(
      mediaId,
      variant as 'original' | 'thumbnail' | 'optimized',
    );
    res.redirect(302, url);
  }

  /**
   * Get media item status and metadata
   * Used by frontend to poll PROCESSING → PROCESSED transition
   */
  @ApiOperation({ summary: 'Get media metadata and processing status' })
  @ApiParam({ name: 'id', description: 'Media attachment ID' })
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
  @ApiOperation({
    summary: 'Delete media item — removes DB record and S3 objects',
  })
  @ApiParam({ name: 'id', description: 'Media attachment ID' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMedia(
    @CurrentUser('id') userId: string,
    @Param('id') mediaId: string,
  ) {
    await this.mediaUploadService.deleteMedia(userId, mediaId);
  }
}
