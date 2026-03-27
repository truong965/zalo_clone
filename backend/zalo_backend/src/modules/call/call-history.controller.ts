import { Controller, Get, Post, Delete, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CallHistoryService } from './call-history.service';
import { PrismaService } from 'src/database/prisma.service';
import { DailyCoService } from './services/daily-co.service';

import { CurrentUser } from 'src/common/decorator/customize';
import type { User } from '@prisma/client';
import { GetCallHistoryQueryDto } from './dto/call-history.dto';

@ApiTags('Calls')
@Controller('calls')
export class CallHistoryController {
  constructor(
    private readonly callService: CallHistoryService,
    private readonly prisma: PrismaService,
    private readonly dailyCoService: DailyCoService,
  ) { }

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

  @Get('active/:conversationId')
  @ApiOperation({ summary: 'Check if a conversation has an active group call' })
  async getActiveCall(
    @CurrentUser() user: User,
    @Param('conversationId') conversationId: string,
  ) {
    // Verify user is a member of this conversation
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId: user.id, status: 'ACTIVE' },
    });

    if (!membership) {
      return { active: false };
    }

    const callId = await this.callService.getActiveCallIdByConversation(conversationId);
    if (!callId) {
      return { active: false };
    }

    const session = await this.callService.getSessionByCallId(callId);
    if (!session) {
      return { active: false };
    }

    // Phase 6: Derive roomUrl from dailyRoomName so banners can rejoin instantly
    const dailyRoomUrl = session.dailyRoomName
      ? this.dailyCoService.getRoomUrl(session.dailyRoomName)
      : undefined;

    return {
      active: true,
      callId: session.callId,
      conversationId,
      participantCount: (session.participantIds?.length ?? 0) + 1,
      startedAt: session.startedAt,
      isJoined: session.participantIds?.includes(user.id) || session.initiatorId === user.id,
      dailyRoomUrl,
    };
  }
}
