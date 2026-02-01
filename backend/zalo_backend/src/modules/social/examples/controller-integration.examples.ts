/**
 * Integration Examples - How to use Social Graph in Controllers
 * 
 * This file demonstrates how to integrate social graph guards and services
 * into existing controllers (Messaging, Calls, etc.)
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport'; // Your existing auth guard
import {
  NotBlockedGuard,
  CanMessageGuard,
  CanCallGuard,
  FriendsOnlyGuard,
} from '../guards';
import { CurrentUser, CurrentUserId, TargetUserId } from '../decorators';
import { FriendshipService } from '../services/friendship.service';
import { BlockService } from '../services/block.service';
import { PrivacyService } from '../services/privacy.service';
import { ContactService } from '../services/contact.service';
import { CallHistoryService } from '../services/call-history.service';
import {
  SendFriendRequestDto,
  AcceptFriendRequestDto,
  UnfriendDto,
} from '../dto/friendship.dto';
import {
  BlockUserDto,
  UpdatePrivacySettingsDto,
} from '../dto/block-privacy.dto';
import { SyncContactsDto } from '../dto/contact.dto';

/**
 * EXAMPLE 1: Messaging Controller Integration
 */
@Controller('messages')
@UseGuards(AuthGuard('jwt')) // Apply auth to all routes
export class MessagesController {
  constructor(
    // Your existing MessageService
    // private readonly messageService: MessageService,
  ) {}

  /**
   * Send a direct message
   * 
   * Guards applied:
   * 1. AuthGuard - Ensure user is authenticated
   * 2. NotBlockedGuard - Ensure users are not blocked
   * 3. CanMessageGuard - Check privacy settings
   */
  @Post('send')
  @UseGuards(NotBlockedGuard, CanMessageGuard)
  async sendMessage(
    @CurrentUserId() senderId: string,
    @Body() dto: { recipientId: string; content: string },
  ) {
    // Guard has already validated:
    // - Users are not blocked
    // - Privacy settings allow messaging
    // - Friendship exists if required

    // Proceed with message sending
    // return this.messageService.sendDirectMessage(senderId, dto);
    return { success: true };
  }

  /**
   * Get conversation with another user
   * 
   * Note: No CanMessageGuard here because viewing history
   * should be allowed even after unfriend
   */
  @Get('conversation/:userId')
  @UseGuards(NotBlockedGuard)
  async getConversation(
    @CurrentUserId() userId: string,
    @Param('userId') otherUserId: string,
  ) {
    // Can view messages but cannot send new ones if unfriended
    // return this.messageService.getConversation(userId, otherUserId);
    return { success: true };
  }
}

/**
 * EXAMPLE 2: Friends Controller
 */
@Controller('friends')
@UseGuards(AuthGuard('jwt'))
export class FriendsController {
  constructor(private readonly friendshipService: FriendshipService) {}

  /**
   * Send friend request
   */
  @Post('requests')
  @UseGuards(NotBlockedGuard) // Ensure not blocked
  async sendFriendRequest(
    @CurrentUserId() userId: string,
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.friendshipService.sendFriendRequest(userId, dto);
  }

  /**
   * Accept friend request
   */
  @Post('requests/accept')
  async acceptFriendRequest(
    @CurrentUserId() userId: string,
    @Body() dto: AcceptFriendRequestDto,
  ) {
    return this.friendshipService.acceptFriendRequest(userId, dto);
  }

  /**
   * Get friend list
   */
  @Get()
  async getFriends(@CurrentUserId() userId: string, @Query() query: any) {
    return this.friendshipService.getFriendsList(userId, query);
  }

  /**
   * Unfriend
   */
  @Post('unfriend')
  async unfriend(
    @CurrentUserId() userId: string,
    @Body() dto: UnfriendDto,
  ) {
    return this.friendshipService.unfriend(userId, dto);
  }

  /**
   * Get mutual friends with another user
   */
  @Get(':userId/mutual')
  async getMutualFriends(
    @CurrentUserId() userId: string,
    @Param('userId') otherUserId: string,
  ) {
    return this.friendshipService.getMutualFriends(userId, otherUserId);
  }
}

/**
 * EXAMPLE 3: Block Controller
 */
@Controller('blocks')
@UseGuards(AuthGuard('jwt'))
export class BlockController {
  constructor(private readonly blockService: BlockService) {}

  /**
   * Block a user
   */
  @Post()
  async blockUser(
    @CurrentUserId() userId: string,
    @Body() dto: BlockUserDto,
  ) {
    return this.blockService.blockUser(userId, dto);
  }

  /**
   * Unblock a user
   */
  @Post('unblock')
  async unblockUser(
    @CurrentUserId() userId: string,
    @Body() dto: { blockedUserId: string },
  ) {
    return this.blockService.unblockUser(userId, dto);
  }

  /**
   * Get blocked users
   */
  @Get()
  async getBlockedUsers(
    @CurrentUserId() userId: string,
    @Query() query: any,
  ) {
    return this.blockService.getBlockedUsers(userId, query);
  }

  /**
   * Check if user is blocked (utility endpoint)
   */
  @Get('check/:userId')
  async checkBlocked(
    @CurrentUserId() userId: string,
    @Param('userId') otherUserId: string,
  ) {
    const isBlocked = await this.blockService.isBlocked(userId, otherUserId);
    return { isBlocked };
  }
}

/**
 * EXAMPLE 4: Privacy Controller
 */
@Controller('privacy')
@UseGuards(AuthGuard('jwt'))
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  /**
   * Get my privacy settings
   */
  @Get()
  async getSettings(@CurrentUserId() userId: string) {
    return this.privacyService.getSettings(userId);
  }

  /**
   * Update privacy settings
   */
  @Post()
  async updateSettings(
    @CurrentUserId() userId: string,
    @Body() dto: UpdatePrivacySettingsDto,
  ) {
    return this.privacyService.updateSettings(userId, dto);
  }

  /**
   * Check if I can message another user
   */
  @Get('check-permission/:userId')
  async checkPermission(
    @CurrentUserId() userId: string,
    @Param('userId') targetId: string,
    @Query('action') action: 'message' | 'call' | 'profile',
  ) {
    return this.privacyService.checkPermission(userId, targetId, action);
  }
}

/**
 * EXAMPLE 5: Contacts Controller
 */
@Controller('contacts')
@UseGuards(AuthGuard('jwt'))
export class ContactsController {
  constructor(private readonly contactService: ContactService) {}

  /**
   * Sync phone contacts
   */
  @Post('sync')
  async syncContacts(
    @CurrentUserId() userId: string,
    @Body() dto: SyncContactsDto,
  ) {
    return this.contactService.syncContacts(userId, dto);
  }

  /**
   * Update contact alias
   */
  @Post(':contactUserId/alias')
  async updateAlias(
    @CurrentUserId() userId: string,
    @Param('contactUserId') contactUserId: string,
    @Body() dto: { aliasName?: string },
  ) {
    return this.contactService.updateContactAlias(
      userId,
      contactUserId,
      dto.aliasName,
    );
  }

  /**
   * Get all contacts
   */
  @Get()
  async getContacts(
    @CurrentUserId() userId: string,
    @Query() query: { cursor?: string; limit?: number },
  ) {
    return this.contactService.getContacts(userId, query.cursor, query.limit);
  }

  /**
   * Resolve display name for a user
   */
  @Get('resolve/:userId')
  async resolveDisplayName(
    @CurrentUserId() userId: string,
    @Param('userId') targetUserId: string,
  ) {
    const displayName = await this.contactService.resolveDisplayName(
      userId,
      targetUserId,
    );
    return { displayName };
  }
}

/**
 * EXAMPLE 6: Calls Controller
 */
@Controller('calls')
@UseGuards(AuthGuard('jwt'))
export class CallsController {
  constructor(private readonly callHistoryService: CallHistoryService) {}

  /**
   * Initiate a call
   * 
   * Guards:
   * - NotBlocked: Ensure not blocked
   * - CanCall: Check privacy settings
   */
  @Post('initiate')
  @UseGuards(NotBlockedGuard, CanCallGuard)
  async initiateCall(
    @CurrentUserId() callerId: string,
    @Body() dto: { calleeId: string },
  ) {
    // Start tracking active call in Redis
    const session = await this.callHistoryService.startCall(
      callerId,
      dto.calleeId,
    );

    // Return session info for WebRTC setup
    return { session };
  }

  /**
   * End a call and log to database
   */
  @Post('end')
  async endCall(
    @CurrentUserId() userId: string,
    @Body() dto: any, // LogCallDto
  ) {
    return this.callHistoryService.endCall(dto);
  }

  /**
   * Get call history
   */
  @Get('history')
  async getCallHistory(
    @CurrentUserId() userId: string,
    @Query() query: any,
  ) {
    return this.callHistoryService.getCallHistory(userId, query);
  }

  /**
   * Get missed calls count
   */
  @Get('missed/count')
  async getMissedCallsCount(@CurrentUserId() userId: string) {
    return this.callHistoryService.getMissedCallsCount(userId);
  }

  /**
   * Get active call (if any)
   */
  @Get('active')
  async getActiveCall(@CurrentUserId() userId: string) {
    const call = await this.callHistoryService.getActiveCall(userId);
    return { activeCall: call };
  }
}

/**
 * EXAMPLE 7: User Profile Controller (Friends-only content)
 */
@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  /**
   * Get public profile (no guard needed)
   */
  @Get(':userId/profile')
  async getPublicProfile(@Param('userId') userId: string) {
    // return this.userService.getPublicProfile(userId);
    return { public: true };
  }

  /**
   * Get private photos (friends only)
   */
  @Get(':userId/photos/private')
  @UseGuards(FriendsOnlyGuard)
  async getPrivatePhotos(
    @CurrentUserId() userId: string,
    @Param('userId') targetId: string,
  ) {
    // Guard ensures they are friends
    // return this.userService.getPrivatePhotos(targetId);
    return { private: true };
  }
}
