import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorator/roles.decorator';
import { AdminStatsService } from '../services/admin-stats.service';
import { DailyStatsQueryDto } from '../dto/daily-stats-query.dto';

/**
 * Admin Stats Controller
 *
 * Endpoints:
 * - GET /admin/stats/overview   → real-time KPI (Redis counters)
 * - GET /admin/stats/daily      → historical time-series (DailyStats table)
 *
 * Protected by JwtAuthGuard (global) + RolesGuard (ADMIN only).
 */
@Controller('admin/stats')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminStatsController {
      constructor(private readonly statsService: AdminStatsService) { }

      @Get('overview')
      getOverview() {
            return this.statsService.getOverview();
      }

      @Get('daily')
      getDailyStats(@Query() dto: DailyStatsQueryDto) {
            return this.statsService.getDailyStats(dto);
      }
}
