import {
  Controller,
  Get,
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
import { BlockService } from '../../block/block.service';
import { PrivacyService } from '../service/privacy.service';
import type { User } from '@prisma/client';
import { GetFriendsQueryDto } from '../dto/friendship.dto';
import { UpdatePrivacySettingsDto } from '../dto/privacy.dto';

@ApiTags('Social - Friendships')
@Controller('friendships')
export class FriendshipsController {
  constructor(
    private readonly friendshipService: FriendshipService,
    private readonly blockService: BlockService,
    private readonly privacyService: PrivacyService,
  ) {}
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

  @Delete(':targetUserId')
  @ApiOperation({ summary: 'Unfriend a user' })
  async unfriend(
    @CurrentUser() user: User,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
  ) {
    return await this.friendshipService.removeFriendship(user.id, targetUserId);
  }

  @Get('mutual/:targetUserId')
  @ApiOperation({ summary: 'Get mutual friends with another user' })
  async getMutualFriends(
    @CurrentUser() user: User,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.friendshipService.getMutualFriends(user.id, targetUserId);
  }
  @Get('check/:targetUserId')
  @ApiOperation({ summary: 'check status friends with another user' })
  async checkStatus(
    @CurrentUser() user: User,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
  ) {
    const friendShips = await this.friendshipService.findFriendship(
      user.id,
      targetUserId,
    );
    return friendShips?.status;
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
