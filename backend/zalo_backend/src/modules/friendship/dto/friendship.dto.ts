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

export class FriendRequestUserDto {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

export class FriendRequestWithUserDto {
  id: string;
  status: FriendshipStatus;
  createdAt: Date;
  expiresAt?: Date;
  requester: FriendRequestUserDto;
  target: FriendRequestUserDto;
}

export class FriendWithUserDto {
  friendshipId: string;
  userId: string;
  /** Raw display name from User table */
  displayName: string;
  /** Resolved name: aliasName > phoneBookName > displayName */
  resolvedDisplayName: string;
  /** User-set alias from UserContact (if exists) */
  aliasName?: string;
  /** Phone-book name from sync (if exists) */
  phoneBookName?: string;
  /** Whether this friend is also in the owner's phone-book contacts */
  isContact: boolean;
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
