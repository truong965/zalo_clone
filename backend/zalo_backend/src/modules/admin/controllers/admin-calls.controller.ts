import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorator/roles.decorator';
import { AdminCallsService } from '../services/admin-calls.service';
import { CallListQueryDto } from '../dto/call-list-query.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

/**
 * Admin Calls Controller
 *
 * Endpoints:
 * - GET /admin/calls          → paginated call history
 * - GET /admin/conversations  → conversation list (no message content)
 *
 * Protected by JwtAuthGuard (global) + RolesGuard (ADMIN only).
 */
@ApiTags('Admin — Calls')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminCallsController {
      constructor(private readonly callsService: AdminCallsService) { }

      @ApiOperation({ summary: 'Get paginated call history with filters' })
      @Get('calls')
      getCalls(@Query() dto: CallListQueryDto) {
            return this.callsService.getCalls(dto);
      }

      @ApiOperation({ summary: 'Get conversation list (metadata only, no message content)' })
      @Get('conversations')
      getConversations(
            @Query('type') type?: string,
            @Query('page') page?: number,
            @Query('limit') limit?: number,
      ) {
            return this.callsService.getConversations(type, page, limit);
      }
}
