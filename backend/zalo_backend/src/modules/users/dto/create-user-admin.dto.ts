import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class CreateUserAdminDto extends CreateUserDto {
  @ApiProperty({
    example: 'uuid-role-id',
    description: 'ID của Role (Chỉ Admin)',
  })
  @IsNotEmpty()
  @IsUUID()
  roleId: string;
}
