import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { UserStatus } from '@prisma/client';

/**
 * DTO for GET /admin/users?status=&platform=&search=&page=&limit=
 */
export class UserListQueryDto {
      @IsOptional()
      @IsEnum(UserStatus)
      status?: UserStatus;

      @IsOptional()
      @IsString()
      platform?: string; // WEB | ANDROID | IOS

      @IsOptional()
      @IsString()
      search?: string; // displayName or phoneNumber

      @IsOptional()
      @IsString()
      dateFrom?: string; // YYYY-MM-DD

      @IsOptional()
      @IsString()
      dateTo?: string; // YYYY-MM-DD

      @IsOptional()
      @Type(() => Number)
      @IsInt()
      @Min(1)
      page?: number = 1;

      @IsOptional()
      @Type(() => Number)
      @IsInt()
      @Min(1)
      @Max(100)
      limit?: number = 20;
}
