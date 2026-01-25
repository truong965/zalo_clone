// src/modules/messaging/dto/update-group.dto.ts

import { IsString, IsOptional, MaxLength, IsBoolean } from 'class-validator';

export class UpdateGroupDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @IsBoolean()
  @IsOptional()
  requireApproval?: boolean; // Toggle member approval
}
