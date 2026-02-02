import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  ForbiddenException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CallHistoryService } from './call-history.service';

import { CurrentUser } from 'src/common/decorator/customize';
import type { User } from '@prisma/client';
import { NotBlockedGuard } from '../social/guards/social.guard';
import { GetCallHistoryQueryDto, LogCallDto } from './dto/call-history.dto';

@ApiTags('Social - Calls')
@Controller('social/calls')
export class CallHistoryController {
  constructor(private readonly callService: CallHistoryService) {}

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

  // Endpoint này thường được gọi bởi Media Server hoặc Internal Service
  // Nếu client gọi, cần validate kỹ để tránh user fake log
  @Post('log')
  @ApiOperation({ summary: 'Log ended call' })
  @UseGuards(NotBlockedGuard) // Đảm bảo nếu bị chặn trong lúc gọi (hoặc hack), user không thể spam log vào DB đối phương
  async logCall(@CurrentUser() user: User, @Body() dto: LogCallDto) {
    // Force senderId là user hiện tại để tránh giả mạo
    //Validate user is part of this call
    if (dto.callerId !== user.id && dto.calleeId !== user.id) {
      throw new ForbiddenException('You are not part of this call');
    }

    // Don't allow user to fake their role
    // The actual callerId and calleeId should come from active call session in Redis
    const activeCall = await this.callService.getActiveCall(user.id);
    if (!activeCall) {
      throw new BadRequestException('No active call found');
    }

    // Use session data, not user input
    return await this.callService.endCall({
      callerId: activeCall.callerId,
      calleeId: activeCall.calleeId,
      status: dto.status,
      duration: dto.duration,
      startedAt: activeCall.startedAt.toISOString(),
      endedAt: new Date().toISOString(),
    });
    // .return await this.callService.logCallEnded({ ...dto, callerId: user.id });
  }
}
