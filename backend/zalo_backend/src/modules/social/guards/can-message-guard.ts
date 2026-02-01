import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrivacyService } from '../service/privacy.service';
import { BlockService } from '../service/block.service';
import { FriendshipService } from '../service/friendship.service';

/**
 * CanMessageGuard - Check if user can send messages
 *
 * Usage:
 * @UseGuards(AuthGuard, CanMessageGuard)
 * @Post('conversations/:conversationId/messages')
 * async sendMessage(@CurrentUser() user, @Body() dto) {...}
 */
@Injectable()
export class CanMessageGuard implements CanActivate {
  constructor(
    private readonly blockService: BlockService,
    private readonly privacyService: PrivacyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const currentUser = request.user;
    const targetUserId =
      request.params?.userId ||
      request.params?.targetUserId ||
      request.body?.targetUserId ||
      request.body?.recipientId || // ← ADD for message endpoints
      request.body?.calleeId || // ← ADD for call endpoints
      request.query?.userId;

    // Check if blocked
    const isBlocked = await this.blockService.isBlocked(
      currentUser.id,
      targetUserId,
    );
    if (isBlocked) {
      throw new ForbiddenException('Cannot message blocked user');
    }

    // Check privacy settings
    const canMessage = await this.privacyService.canUserMessageMe(
      currentUser.id,
      targetUserId,
    );

    if (!canMessage) {
      throw new ForbiddenException(
        'User privacy settings do not allow messaging',
      );
    }

    return true;
  }
}

/**
 * CanCallGuard - Check if user can initiate calls
 *
 * Usage:
 * @UseGuards(AuthGuard, CanCallGuard)
 * @Post('calls/initiate')
 * async initiateCall(@CurrentUser() user, @Body() dto) {...}
 */
@Injectable()
export class CanCallGuard implements CanActivate {
  constructor(
    private readonly privacyService: PrivacyService,
    private readonly blockService: BlockService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const currentUser = request.user;

    if (!currentUser) {
      throw new ForbiddenException('Authentication required');
    }

    // Extract target user ID
    const targetUserId =
      request.params?.userId ||
      request.body?.calleeId ||
      request.body?.targetUserId;

    if (!targetUserId) {
      throw new ForbiddenException('Target user ID required');
    }

    // Cannot call yourself
    if (currentUser.id === targetUserId) {
      throw new ForbiddenException('Cannot call yourself');
    }

    // Check if blocked
    const isBlocked = await this.blockService.isBlocked(
      currentUser.id,
      targetUserId,
    );

    if (isBlocked) {
      throw new ForbiddenException('Cannot call blocked user');
    }

    // Check privacy settings
    const canCall = await this.privacyService.canUserCallMe(
      currentUser.id,
      targetUserId,
    );

    if (!canCall) {
      throw new ForbiddenException(
        'User privacy settings do not allow calls. Send a friend request first.',
      );
    }

    return true;
  }
}

/**
 * FriendsOnlyGuard - Ensure action is only between friends
 *
 * Usage:
 * @UseGuards(AuthGuard, FriendsOnlyGuard)
 * @Get('users/:userId/photos')
 * async getPrivatePhotos(@CurrentUser() user, @Param('userId') targetId) {...}
 */
@Injectable()
export class FriendsOnlyGuard implements CanActivate {
  constructor(private readonly friendshipService: FriendshipService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const currentUser = request.user;

    if (!currentUser) {
      throw new ForbiddenException('Authentication required');
    }

    // Extract target user ID
    const targetUserId =
      request.params?.userId ||
      request.params?.targetUserId ||
      request.body?.userId;

    if (!targetUserId) {
      throw new ForbiddenException('Target user ID required');
    }

    // Allow if accessing own resource
    if (currentUser.id === targetUserId) {
      return true;
    }

    // Check friendship
    const areFriends = await this.friendshipService.areFriends(
      currentUser.id,
      targetUserId,
    );

    if (!areFriends) {
      throw new ForbiddenException('This action requires friendship');
    }

    return true;
  }
}
