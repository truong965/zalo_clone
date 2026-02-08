import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: '+84987654321',
    description: 'Phone number with country code',
  })
  @IsString()
  @IsNotEmpty()
  // @Matches(/(84|0[3|5|7|8|9])+([0-9]{8})\b/g, {
  //   message: 'Số điện thoại không đúng định dạng Việt Nam',
  // })
  phoneNumber: string;

  @ApiProperty({
    example: 'SecurePassword123!',
    description: 'User password (min 6 characters)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
