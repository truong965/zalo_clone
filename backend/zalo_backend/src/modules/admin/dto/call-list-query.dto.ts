import {
      IsOptional,
      IsString,
      IsInt,
      Min,
      Max,
      IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for GET /admin/calls?from=&to=&type=&status=&page=&limit=
 */
export class CallListQueryDto {
      @IsOptional()
      @IsString()
      type?: string; // VOICE | VIDEO

      @IsOptional()
      @IsString()
      status?: string; // COMPLETED | MISSED | REJECTED | CANCELLED | NO_ANSWER | FAILED

      @IsOptional()
      @IsDateString()
      from?: string; // YYYY-MM-DD

      @IsOptional()
      @IsDateString()
      to?: string; // YYYY-MM-DD

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
