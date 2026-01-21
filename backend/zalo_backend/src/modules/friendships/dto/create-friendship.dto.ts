import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFriendshipDto {
  @ApiProperty({ description: 'ID của user muốn kết bạn', example: 'uuid...' })
  @IsNotEmpty({ message: 'Target User ID không được để trống' })
  @IsUUID('4', { message: 'Target User ID phải là UUID hợp lệ' })
  toUserId: string;
}
