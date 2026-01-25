import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsUUID,
  IsOptional,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
  IsBoolean,
} from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1, {
    message: 'Group must have at least 1 member besides creator',
  })
  @ArrayMaxSize(256, { message: 'Maximum 256 members in a group' })
  memberIds: string[]; // Initial members (excluding creator)

  @IsBoolean()
  @IsOptional()
  requireApproval?: boolean; // Bật chế độ duyệt thành viên ngay từ đầu
}
