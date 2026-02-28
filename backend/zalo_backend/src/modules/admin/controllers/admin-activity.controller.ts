import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorator/roles.decorator';
import { AdminActivityService } from '../services/admin-activity.service';

/**
 * Admin Activity Controller
 *
 * "Anomaly detection" endpoints — replaces the old Reports page.
 *
 * Endpoints:
 * - GET /admin/activity/suspended     → SUSPENDED users
 * - GET /admin/activity/inactive      → users not seen in N days
 * - GET /admin/activity/high-activity → outlier users (potential spam)
 * - GET /admin/activity/multi-device  → users with unusually many active sessions
 *
 * Protected by JwtAuthGuard (global) + RolesGuard (ADMIN only).
 */
@Controller('admin/activity')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminActivityController {
      constructor(private readonly activityService: AdminActivityService) { }

      @Get('suspended')
      getSuspendedUsers() {
            return this.activityService.getSuspendedUsers();
      }

      @Get('inactive')
      getInactiveUsers(@Query('days') days?: number) {
            return this.activityService.getInactiveUsers(days);
      }

      @Get('high-activity')
      getHighActivityUsers(
            @Query('hours') hours?: number,
            @Query('threshold') threshold?: number,
      ) {
            return this.activityService.getHighActivityUsers(hours, threshold);
      }

      @Get('multi-device')
      getMultiDeviceUsers(@Query('minSessions') minSessions?: number) {
            return this.activityService.getMultiDeviceUsers(minSessions);
      }
}
