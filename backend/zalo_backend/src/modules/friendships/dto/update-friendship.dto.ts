import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FriendshipStatus } from '@prisma/client';

export class UpdateFriendshipDto {
  @ApiProperty({
    enum: FriendshipStatus,
    description: 'Trạng thái muốn cập nhật',
  })
  @IsNotEmpty()
  @IsEnum(FriendshipStatus, {
    message: 'Status phải là PENDING, ACCEPTED hoặc DECLINED',
  })
  status: FriendshipStatus;
}
