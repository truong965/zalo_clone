import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { FriendshipService } from '../service/friendship.service';
import { SocialFacade } from '../social.facade';
import { extractTargetUserId } from './guard.helper';

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
  constructor(private readonly socialFacade: SocialFacade) {} // Inject Facade

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const currentUser = request.user;

    // Normalize targetId extraction
    const targetUserId = extractTargetUserId(context);

    // [UPDATED] Use Facade
    const canMessage = await this.socialFacade.validateMessageAccess(
      currentUser.id,
      targetUserId,
    );

    if (!canMessage) {
      throw new ForbiddenException(
        'You cannot message this user (Blocked or Privacy restricted)',
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
  constructor(private readonly socialFacade: SocialFacade) {} // Inject Facade

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const currentUser = request.user;

    if (!currentUser) throw new ForbiddenException('Authentication required');

    const targetUserId = extractTargetUserId(context);

    if (currentUser.id === targetUserId) {
      throw new ForbiddenException('Cannot call yourself');
    }
    // [UPDATED] Use Facade
    const canCall = await this.socialFacade.validateCallAccess(
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
    const targetUserId = extractTargetUserId(context);

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
