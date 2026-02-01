/**
 * NotBlockedGuard - Prevent actions between blocked users
 *
 * Usage:
 * @UseGuards(AuthGuard, NotBlockedGuard)
 * async sendMessage(@CurrentUser() user, @Param('userId') targetId) {...}
 *
 * This guard should be used on all endpoints that involve user-to-user interaction:
 * - Messaging
 * - Calling
 * - Profile viewing
 * - Friend requests
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BlockService } from '../service/block.service';

/**
 * Metadata key for skipping block check
 */
export const SKIP_BLOCK_CHECK = 'skipBlockCheck';

@Injectable()
export class NotBlockedGuard implements CanActivate {
  constructor(
    private readonly blockService: BlockService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if block check should be skipped (for specific endpoints)
    const skipBlockCheck = this.reflector.getAllAndOverride<boolean>(
      SKIP_BLOCK_CHECK,
      [context.getHandler(), context.getClass()],
    );

    if (skipBlockCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const currentUser = request.user;

    if (!currentUser) {
      throw new ForbiddenException('Authentication required');
    }

    // Extract target user ID from request
    // Try multiple sources: params, body, query
    const targetUserId =
      request.params?.userId ||
      request.params?.targetUserId ||
      request.body?.targetUserId ||
      request.body?.userId ||
      request.query?.userId;

    if (!targetUserId) {
      // No target user specified - allow (might be bulk operation)
      return true;
    }

    // Check if users are blocked
    const isBlocked = await this.blockService.isBlocked(
      currentUser.id,
      targetUserId,
    );

    if (isBlocked) {
      throw new ForbiddenException(
        'Cannot perform this action with a blocked user',
      );
    }

    return true;
  }
}

/**
 * Decorator to skip block check for specific endpoints
 *
 * Example:
 * @SkipBlockCheck()
 * @Get('public-info/:userId')
 * async getPublicInfo(@Param('userId') userId: string) {...}
 */
export const SkipBlockCheck = () => Reflect.metadata(SKIP_BLOCK_CHECK, true);
