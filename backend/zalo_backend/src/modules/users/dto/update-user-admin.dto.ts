import { PartialType } from '@nestjs/swagger';
import { CreateUserAdminDto } from './create-user-admin.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { UserStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserAdminDto extends PartialType(CreateUserAdminDto) {
  // Admin được quyền sửa Status (User thường không được)
  @ApiProperty({
    enum: UserStatus,
    required: false,
    description: 'Trạng thái tài khoản',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  // Lưu ý: Password, PhoneNumber, RoleId đã có sẵn do kế thừa từ CreateUserAdminDto
  // và PartialType đã biến chúng thành Optional
}
