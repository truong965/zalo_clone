// src/modules/auth/dto/register.dto.ts
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
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
  @Matches(/(84|0[3|5|7|8|9])+([0-9]{8})\b/g, {
    message: 'Số điện thoại không đúng định dạng Việt Nam',
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
