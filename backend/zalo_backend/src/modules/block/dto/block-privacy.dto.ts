import { IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'; // Nếu bạn dùng Swagger

export enum BlockRelation {
  NONE = 'NONE',
  BLOCKED_BY_ME = 'BLOCKED_BY_ME', // Tôi chặn họ
  BLOCKED_BY_THEM = 'BLOCKED_BY_THEM', // Họ chặn tôi
  BOTH = 'BOTH', // Chặn 2 chiều
}
/**
 * DTO for blocking a user (Nếu bạn cần dùng chung trong file này)
 */
export class BlockUserDto {
  @ApiProperty({ description: 'ID của user muốn chặn' })
  @IsUUID()
  targetUserId: string;

  @ApiPropertyOptional({ description: 'Lý do chặn' })
  @IsOptional()
  reason?: string;
}

export class BlockResponseDto {
  id: string;
  blockerId: string;
  blockedId: string;
  reason?: string;
  createdAt: Date;
}

export class BlockedUserDto {
  @ApiProperty()
  blockId: string;
  @ApiProperty()
  userId: string;
  @ApiProperty()
  displayName: string;
  @ApiPropertyOptional()
  avatarUrl?: string; // string | undefined
  @ApiProperty()
  blockedAt: Date;
  @ApiPropertyOptional()
  reason?: string;
}
