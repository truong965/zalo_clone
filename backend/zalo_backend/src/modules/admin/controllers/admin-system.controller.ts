import { Controller, Get, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorator/roles.decorator';
import { AdminSystemService } from '../services/admin-system.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

/**
 * Admin System Controller
 *
 * Endpoints:
 * - GET /admin/system/status → infrastructure health check
 *
 * Protected by JwtAuthGuard (global) + RolesGuard (ADMIN only).
 */
@ApiTags('Admin — System')
@ApiBearerAuth()
@Controller('admin/system')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminSystemController {
      constructor(private readonly systemService: AdminSystemService) { }

      @ApiOperation({ summary: 'Get infrastructure health check (DB, Redis, S3, queue)' })
      @Get('status')
      getSystemStatus() {
            return this.systemService.getSystemStatus();
      }
}
