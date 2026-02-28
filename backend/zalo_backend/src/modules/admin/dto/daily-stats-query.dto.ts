import { IsOptional, IsDateString } from 'class-validator';

/**
 * DTO for GET /admin/stats/daily?from=&to=
 * Validates date range query parameters.
 */
export class DailyStatsQueryDto {
      @IsOptional()
      @IsDateString()
      from?: string; // YYYY-MM-DD

      @IsOptional()
      @IsDateString()
      to?: string; // YYYY-MM-DD
}
