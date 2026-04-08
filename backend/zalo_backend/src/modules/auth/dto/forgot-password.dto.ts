import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { NormalizePhone } from 'src/common/decorator/normalize-phone.decorator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com / 0123456789', description: 'Email hoặc Số điện thoại' })
  @IsNotEmpty({ message: 'Vui lòng nhập định danh của bạn' })
  @NormalizePhone()
  identifier: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'uuid-reset-token', description: 'Token reset mật khẩu nhận được sau khi xác thực 2FA' })
  @IsString()
  @IsNotEmpty()
  resetToken: string;

  @ApiProperty({ example: 'NewPassword123!', description: 'Mật khẩu mới' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  newPassword: string;
}
