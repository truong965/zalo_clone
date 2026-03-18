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
import { InteractionAuthorizationService } from '@modules/authorization/services/interaction-authorization.service';
import { extractTargetUserId } from '@common/guards/guard.helper';

/**
 * Metadata key for skipping block check
 */
export const SKIP_BLOCK_CHECK = 'skipBlockCheck';

@Injectable()
export class NotBlockedGuard implements CanActivate {
  constructor(
    private readonly interactionAuthService: InteractionAuthorizationService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skipBlockCheck = this.reflector.getAllAndOverride<boolean>(
      SKIP_BLOCK_CHECK,
      [context.getHandler(), context.getClass()],
    );

    if (skipBlockCheck) return true;

    const request = context.switchToHttp().getRequest();
    const currentUser = request.user;

    if (!currentUser) throw new ForbiddenException('Authentication required');

    // [REFACTORED Action 3.2] Chuẩn hóa input, không đoán mò
    let targetUserId: string;

    try {
      targetUserId = extractTargetUserId(context);
    } catch (e) {
      // Nếu endpoint không có targetUserId thì Guard này coi như pass (không check block)
      // Ví dụ: Get danh sách bạn bè của chính mình
      return true;
    }

    // [UPDATED] Use Shared Service
    const isBlocked = await this.interactionAuthService.isBlocked(
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
