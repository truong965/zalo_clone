import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class EmailChangeRequestDto {
  @ApiProperty({ example: 'new-email@example.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty()
  newEmail: string;

  @ApiProperty({ example: 'YourPassword123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}

export class EmailChangeConfirmDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  otp: string;
}
