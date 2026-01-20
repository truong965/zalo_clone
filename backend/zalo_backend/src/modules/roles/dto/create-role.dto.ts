import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateRoleDto {
  @ApiProperty({ example: 'ADMIN', description: 'Tên vai trò (Unique)' })
  @IsNotEmpty({ message: 'Tên vai trò không được để trống' })
  @IsString()
  @MaxLength(50)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  name: string;

  @ApiProperty({ example: 'Quản trị viên hệ thống', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({
    example: ['uuid-1', 'uuid-2'],
    description: 'Danh sách ID của Permissions',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true }) // Check từng phần tử phải là String
  @IsUUID(undefined, { each: true }) // Check từng phần tử phải là UUID chuẩn
  permissions?: string[];
}
