import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteAccountDto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;
}
