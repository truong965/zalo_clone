import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateUserDto {
  @ApiProperty({ example: 'Nguyen Van A', description: 'Tên hiển thị' })
  @IsNotEmpty({ message: 'Tên không được để trống' })
  @IsString()
  displayName: string;

  @ApiProperty({ example: '0987654321', description: 'Số điện thoại (VN)' })
  @IsNotEmpty()
  @IsPhoneNumber('VN', {
    message: 'phoneNumber must be a valid phone number (e.g. 09xxx or +849xxx)',
  })
  phoneNumber: string;

  @ApiProperty({ example: 'MatKhauSieuManh123', description: 'Mật khẩu' })
  @IsNotEmpty()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;

  @ApiProperty({ enum: Gender, required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Date)
  dateOfBirth?: Date;
}
