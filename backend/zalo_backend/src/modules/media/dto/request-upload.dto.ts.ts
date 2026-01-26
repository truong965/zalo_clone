// src/modules/media/dto/request-upload.dto.ts

import {
  IsString,
  IsEnum,
  IsInt,
  IsOptional,
  MaxLength,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { MediaType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class RequestUploadDto {
  @ApiProperty({
    description: 'Original file name',
    example: 'vacation-photo.jpg',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'File name contains invalid characters',
  })
  fileName: string;

  @ApiProperty({
    description: 'MIME type of the file',
    example: 'image/jpeg',
    enum: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'video/mp4',
      'video/quicktime',
      'application/pdf',
    ],
  })
  @IsString()
  mimeType: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 2048576,
    minimum: 1,
    maximum: 52428800, // 50MB
  })
  @IsInt()
  @Min(1)
  @Max(52428800) // 50MB absolute max
  fileSize: number;

  @ApiProperty({
    description: 'Media type category',
    enum: MediaType,
    example: 'IMAGE',
  })
  @IsEnum(MediaType)
  mediaType: MediaType;

  @ApiProperty({
    description: 'Platform uploading from',
    example: 'WEB',
    required: false,
  })
  @IsString()
  @IsOptional()
  uploadedFrom?: string;
}
