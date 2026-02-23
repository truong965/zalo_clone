import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CursorPaginationDto } from '@common/dto/cursor-pagination.dto';

export enum BlockRelation {
  NONE = 'NONE',
  BLOCKED_BY_ME = 'BLOCKED_BY_ME', // Tôi chặn họ
  BLOCKED_BY_THEM = 'BLOCKED_BY_THEM', // Họ chặn tôi
  BOTH = 'BOTH', // Chặn 2 chiều
}

/**
 * DTO for blocking a user
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
  avatarUrl?: string;
  @ApiProperty()
  blockedAt: Date;
  @ApiPropertyOptional()
  reason?: string;
}

/**
 * DTO for querying blocked list with optional search
 */
export class GetBlockedListQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    description: 'Tìm kiếm theo tên hiển thị (alias > phoneBook > displayName)',
    example: 'Tuan',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
