import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorator/roles.decorator';
import { AdminCallsService } from '../services/admin-calls.service';
import { CallListQueryDto } from '../dto/call-list-query.dto';

/**
 * Admin Calls Controller
 *
 * Endpoints:
 * - GET /admin/calls          → paginated call history
 * - GET /admin/conversations  → conversation list (no message content)
 *
 * Protected by JwtAuthGuard (global) + RolesGuard (ADMIN only).
 */
@Controller('admin')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminCallsController {
      constructor(private readonly callsService: AdminCallsService) { }

      @Get('calls')
      getCalls(@Query() dto: CallListQueryDto) {
            return this.callsService.getCalls(dto);
      }

      @Get('conversations')
      getConversations(
            @Query('type') type?: string,
            @Query('page') page?: number,
            @Query('limit') limit?: number,
      ) {
            return this.callsService.getConversations(type, page, limit);
      }
}
