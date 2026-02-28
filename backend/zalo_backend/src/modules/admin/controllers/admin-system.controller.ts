import { Controller, Get, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorator/roles.decorator';
import { AdminSystemService } from '../services/admin-system.service';

/**
 * Admin System Controller
 *
 * Endpoints:
 * - GET /admin/system/status → infrastructure health check
 *
 * Protected by JwtAuthGuard (global) + RolesGuard (ADMIN only).
 */
@Controller('admin/system')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminSystemController {
      constructor(private readonly systemService: AdminSystemService) { }

      @Get('status')
      getSystemStatus() {
            return this.systemService.getSystemStatus();
      }
}
