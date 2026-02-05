import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorator/customize';
import { FriendshipService } from '../service/friendship.service';
import type { User } from '@prisma/client';
@ApiTags('friend-requests')
@Controller('friend-requests')
export class FriendRequestController {
  constructor(private readonly friendshipService: FriendshipService) {}
  // ==============================
  // 1. FRIEND REQUESTS
  // ==============================

  @Post()
  @ApiOperation({ summary: 'Send a friend request' })
  async sendFriendRequest(
    @CurrentUser() user: User,
    @Body('targetUserId') targetUserId: string,
  ) {
    return this.friendshipService.sendFriendRequest(user.id, targetUserId);
  }

  @Get('received')
  @ApiOperation({ summary: 'Get received friend requests (Pending)' })
  async getReceivedRequests(@CurrentUser() user: User) {
    return await this.friendshipService.getReceivedRequests(user.id);
  }

  @Get('sent')
  @ApiOperation({ summary: 'Get sent friend requests (Pending)' })
  async getSentRequests(@CurrentUser() user: User) {
    return this.friendshipService.getSentRequests(user.id);
  }

  @Put(':requestId/accept')
  @ApiOperation({ summary: 'Accept a friend request' })
  async acceptRequest(
    @CurrentUser() user: User,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return await this.friendshipService.acceptRequest(user.id, requestId);
  }

  @Put(':requestId/decline')
  @ApiOperation({ summary: 'Decline a friend request' })
  async declineRequest(
    @CurrentUser() user: User,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return await this.friendshipService.declineRequest(user.id, requestId);
  }

  @Delete(':requestId')
  @ApiOperation({ summary: 'Cancel a sent friend request' })
  async cancelRequest(
    @CurrentUser() user: User,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    await this.friendshipService.cancelRequest(user.id, requestId);
  }
}
