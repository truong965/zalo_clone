import { IsOptional, IsEnum, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FriendshipStatus } from '@prisma/client';
import { CursorPaginationDto } from '@common/dto/cursor-pagination.dto';

// --- QUERY DTOs ---

export class GetFriendsQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    enum: FriendshipStatus,
    default: FriendshipStatus.ACCEPTED,
  })
  @IsOptional()
  @IsEnum(FriendshipStatus)
  status?: FriendshipStatus;
  @ApiPropertyOptional({
    description: 'Tìm kiếm theo Tên hiển thị hoặc Số điện thoại',
    example: 'Tuan',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

// --- RESPONSE DTOs ---

export class FriendshipResponseDto {
  id: string;
  user1Id: string;
  user2Id: string;
  requesterId: string;
  status: FriendshipStatus;
  createdAt: Date;
  acceptedAt?: Date;
  declinedAt?: Date;
  expiresAt?: Date;
}

export class FriendWithUserDto {
  friendshipId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  status: FriendshipStatus;
  createdAt: Date;
  acceptedAt?: Date;
}

export class MutualFriendsDto {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}
