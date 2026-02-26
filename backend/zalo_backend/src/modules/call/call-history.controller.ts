import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CallHistoryService } from './call-history.service';

import { CurrentUser } from 'src/common/decorator/customize';
import type { User } from '@prisma/client';
import { GetCallHistoryQueryDto } from './dto/call-history.dto';

@ApiTags('Calls')
@Controller('calls')
export class CallHistoryController {
  constructor(private readonly callService: CallHistoryService) { }

  @Get('history')
  @ApiOperation({ summary: 'Get call history with pagination' })
  async getHistory(
    @CurrentUser() user: User,
    @Query() query: GetCallHistoryQueryDto,
  ) {
    return await this.callService.getCallHistory(user.id, query);
  }

  @Get('missed')
  @ApiOperation({ summary: 'Get unread missed calls count or list' })
  async getMissed(@CurrentUser() user: User) {
    return await this.callService.getMissedCalls(user.id);
  }

  @Post('missed/view-all') // Đổi Patch -> Post vì đây là Action
  @ApiOperation({ summary: 'Mark all missed calls as viewed' })
  async markAllViewed(@CurrentUser() user: User) {
    return await this.callService.markAllMissedAsViewed(user.id);
  }

  @Delete('history/:callId')
  @ApiOperation({ summary: 'Delete a specific call log (Soft delete)' })
  async deleteCallLog(
    @CurrentUser() user: User,
    @Param('callId') callId: string,
  ) {
    // Note: Cần implement thêm function này trong service
    return await this.callService.deleteCallLog(user.id, callId);
  }

}
