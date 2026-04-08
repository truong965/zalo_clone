import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPhoneNumber, IsString, Length } from 'class-validator';
import { NormalizePhone } from 'src/common/decorator/normalize-phone.decorator';

export class RequestRegisterOtpDto {
  @ApiProperty({ example: '0912345678', description: 'Số điện thoại đăng ký (ví dụ: 0912345678 hoặc 8491234567)' })
  @NormalizePhone()
  @IsPhoneNumber('VN', {
    message: 'phoneNumber must be a valid phone number (e.g. 09xxx or +849xxx)',
  })
  @IsNotEmpty()
  phoneNumber: string;
}

export class VerifyRegisterOtpDto {
  @ApiProperty({ example: '0912345678' })
  @NormalizePhone()
  @IsPhoneNumber('VN', {
    message: 'phoneNumber must be a valid phone number (e.g. 09xxx or +849xxx)',
  })
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: '123456', description: 'Mã OTP 6 số' })
  @IsString()
  @Length(6, 6)
  otp: string;
}
