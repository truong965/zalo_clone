// src/modules/media/dto/get-media.dto.ts

import { IsUUID, IsOptional, IsEnum } from 'class-validator';
import { MediaProcessingStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class GetMediaDto {
  @ApiProperty({
    description: 'Filter by processing status',
    enum: MediaProcessingStatus,
    required: false,
  })
  @IsEnum(MediaProcessingStatus)
  @IsOptional()
  status?: MediaProcessingStatus;

  @ApiProperty({
    description: 'Filter by conversation ID',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  conversationId?: string;
}
