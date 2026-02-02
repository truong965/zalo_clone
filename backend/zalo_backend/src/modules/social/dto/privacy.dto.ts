import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'; // Nếu bạn dùng Swagger
import { PrivacyLevel } from '@prisma/client';

/**
 * DTO for updating privacy settings
 * All fields are optional because user might update only one setting
 */
export class UpdatePrivacySettingsDto {
  @ApiPropertyOptional({
    enum: PrivacyLevel,
    description: 'Ai có thể xem profile của tôi',
  })
  @IsOptional()
  @IsEnum(PrivacyLevel)
  showProfile?: PrivacyLevel;

  @ApiPropertyOptional({
    enum: PrivacyLevel,
    description: 'Ai có thể nhắn tin cho tôi',
  })
  @IsOptional()
  @IsEnum(PrivacyLevel)
  whoCanMessageMe?: PrivacyLevel;

  @ApiPropertyOptional({
    enum: PrivacyLevel,
    description: 'Ai có thể gọi điện cho tôi',
  })
  @IsOptional()
  @IsEnum(PrivacyLevel)
  whoCanCallMe?: PrivacyLevel;

  @ApiPropertyOptional({ description: 'Hiển thị trạng thái online' })
  @IsOptional()
  @IsBoolean()
  showOnlineStatus?: boolean;

  @ApiPropertyOptional({
    description: 'Hiển thị lần cuối truy cập (Last seen)',
  })
  @IsOptional()
  @IsBoolean()
  showLastSeen?: boolean;
}

/**
 * DTO for Privacy Settings Response
 */
export class PrivacySettingsResponseDto {
  @ApiProperty({ description: 'ID của user sở hữu setting này' })
  userId: string;

  @ApiProperty({ enum: PrivacyLevel })
  showProfile: PrivacyLevel;

  @ApiProperty({ enum: PrivacyLevel })
  whoCanMessageMe: PrivacyLevel;

  @ApiProperty({ enum: PrivacyLevel })
  whoCanCallMe: PrivacyLevel;

  @ApiProperty()
  showOnlineStatus: boolean;

  @ApiProperty()
  showLastSeen: boolean;

  @ApiProperty()
  updatedAt: Date;
}

/**
 * DTO for permission check result
 */
export class PermissionCheckDto {
  @ApiProperty({ description: 'Hành động có được phép không' })
  allowed: boolean;

  @ApiPropertyOptional({ description: 'Lý do bị từ chối (nếu có)' })
  reason?: string;
}
