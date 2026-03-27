import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'oldPassword123' })
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @ApiProperty({ example: 'newPassword123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Mật khẩu mới phải từ 6 ký tự' })
  newPassword: string;
  
  @ApiProperty({ example: true, required: false })
  @IsString() // We might need to handle transformation if it's sent as string, but here it's likely JSON
  @IsNotEmpty()
  logoutAllDevices?: boolean;
}
