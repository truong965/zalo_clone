import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreatePermissionDto {
  @ApiProperty({ example: 'Create User', description: 'Tên quyền hạn' })
  @IsNotEmpty({ message: 'Tên quyền hạn không được để trống' })
  @IsString()
  name: string;

  @ApiProperty({ example: '/api/v1/users', description: 'Endpoint API' })
  @IsNotEmpty()
  @IsString()
  apiPath: string;

  @ApiProperty({ example: 'POST', description: 'Method: GET, POST, PUT...' })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  ) // Tự động viết hoa
  method: string;

  @ApiProperty({ example: 'USERS', description: 'Thuộc module nào' })
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  module: string;
}
