import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Query,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorator/customize';
import { FriendshipService } from '../service/friendship.service';
import { BlockService } from '../service/block.service';
import { PrivacyService } from '../service/privacy.service';
import type { User } from '@prisma/client';
import { GetFriendsQueryDto } from '../dto/friendship.dto';
import {
  BlockUserDto,
  UpdatePrivacySettingsDto,
} from '../dto/block-privacy.dto';
import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';

@ApiTags('Social - Friendships')
@Controller('friendships')
export class FriendshipsController {
  constructor(
    private readonly friendshipService: FriendshipService,
    private readonly blockService: BlockService,
    private readonly privacyService: PrivacyService,
  ) {}

  // ==============================
  // 1. FRIEND REQUESTS
  // ==============================

  @Post('requests')
  @ApiOperation({ summary: 'Send a friend request' })
  async sendFriendRequest(
    @CurrentUser() user: User,
    @Body('targetUserId') targetUserId: string,
  ) {
    return this.friendshipService.sendFriendRequest(user.id, targetUserId);
  }

  @Get('requests/received')
  @ApiOperation({ summary: 'Get received friend requests (Pending)' })
  async getReceivedRequests(@CurrentUser() user: User) {
    return await this.friendshipService.getReceivedRequests(user.id);
  }

  @Get('requests/sent')
  @ApiOperation({ summary: 'Get sent friend requests (Pending)' })
  async getSentRequests(@CurrentUser() user: User) {
    return this.friendshipService.getSentRequests(user.id);
  }

  @Put('requests/:requestId/accept')
  @ApiOperation({ summary: 'Accept a friend request' })
  async acceptRequest(
    @CurrentUser() user: User,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return await this.friendshipService.acceptRequest(user.id, requestId);
  }

  @Put('requests/:requestId/decline')
  @ApiOperation({ summary: 'Decline a friend request' })
  async declineRequest(
    @CurrentUser() user: User,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return await this.friendshipService.declineRequest(user.id, requestId);
  }

  @Delete('requests/:requestId')
  @ApiOperation({ summary: 'Cancel a sent friend request' })
  async cancelRequest(
    @CurrentUser() user: User,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    await this.friendshipService.cancelRequest(user.id, requestId);
  }

  // ==============================
  // 2. FRIEND LIST & MANAGEMENT
  // ==============================

  @Get()
  @ApiOperation({ summary: 'Get my friends list with pagination/search' })
  async getFriends(
    @CurrentUser() user: User,
    @Query() query: GetFriendsQueryDto,
  ) {
    return this.friendshipService.getFriendsList(user.id, query);
  }

  @Delete(':friendId')
  @ApiOperation({ summary: 'Unfriend a user' })
  async unfriend(
    @CurrentUser() user: User,
    @Param('friendId', ParseUUIDPipe) friendId: string,
  ) {
    return await this.friendshipService.removeFriendship(user.id, friendId);
  }

  // ==============================
  // 3. BLOCKING
  // ==============================

  @Post('block')
  @ApiOperation({ summary: 'Block a user' })
  async blockUser(@CurrentUser() user: User, @Body() dto: BlockUserDto) {
    return this.blockService.blockUser(user.id, dto);
  }

  @Delete('block/:targetId')
  @ApiOperation({ summary: 'Unblock a user' })
  async unblockUser(
    @CurrentUser() user: User,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ) {
    return this.blockService.unblockUser(user.id, targetId);
  }

  @Get('blocked')
  @ApiOperation({ summary: 'Get list of blocked users' })
  async getBlockedUsers(
    @CurrentUser() user: User,
    @Query() query: CursorPaginationDto,
  ) {
    return await this.blockService.getBlockedList(user.id, query);
  }

  // ==============================
  // 4. PRIVACY
  // ==============================

  @Get('privacy')
  @ApiOperation({ summary: 'Get my privacy settings' })
  async getPrivacySettings(@CurrentUser() user: User) {
    return this.privacyService.getSettings(user.id);
  }

  @Patch('privacy')
  @ApiOperation({ summary: 'Update privacy settings' })
  async updatePrivacySettings(
    @CurrentUser() user: User,
    @Body() dto: UpdatePrivacySettingsDto,
  ) {
    return this.privacyService.updateSettings(user.id, dto);
  }
}
