// src/modules/media/dto/initiate-upload.dto.ts
import { IsString, IsInt, Min, Max, MaxLength, Matches, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitiateUploadDto {
  @ApiProperty({
    description: 'Original name of the file',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  // Regex để chặn các tên file chứa ký tự đặc biệt nguy hiểm (tùy chọn nhưng recommended)
  @Matches(/^[a-zA-Z0-9._-\s()]+$/, {
    message: 'File name contains invalid characters',
  })
  fileName: string;

  @ApiProperty({ description: 'MIME type (image/jpeg, video/mp4...)' })
  @IsString()
  // Validation logic chi tiết hơn thường nằm ở Service hoặc Custom Validator
  // ở đây giữ string basic
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes', maximum: 52428800 })
  @IsInt()
  @Min(1)
  @Max(104857600) // 50MB matches uploadConfig logic
  fileSize: number;
}

export interface InitiateUploadResponse {
  uploadId: string;
  presignedUrl: string;
  expiresIn: number;
  s3Key: string;
}

// ── Avatar upload ─────────────────────────────────────────────────────────────
// Avatars bypass the media worker pipeline — they are uploaded directly to the
// `avatars/` S3 prefix and served via CloudFront (prod) or MinIO URL (dev).
// No MediaAttachment DB record is created.
export class AvatarUploadDto {
  @IsString()
  @MaxLength(255)
  fileName: string;

  @IsString()
  mimeType: string; // must be image/*

  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024) // 10 MB
  fileSize: number;

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsEnum(['USER', 'GROUP'])
  targetType?: 'USER' | 'GROUP';
}

export interface AvatarUploadResponse {
  presignedUrl: string; // PUT directly from browser to S3
  fileUrl: string; // CloudFront URL (prod) or MinIO URL (dev) — save as avatarUrl
  expiresIn: number;
  s3Key: string;
}
