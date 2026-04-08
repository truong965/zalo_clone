import { IsString, IsNotEmpty, MinLength, IsPhoneNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizePhone } from 'src/common/decorator/normalize-phone.decorator';

export class LoginDto {
  @ApiProperty({
    example: '0987654321',
    description: 'Phone number (VN)',
  })
  @NormalizePhone()
  @IsPhoneNumber('VN')
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
