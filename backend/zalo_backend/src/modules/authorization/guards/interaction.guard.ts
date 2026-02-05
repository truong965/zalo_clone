/**
 * InteractionGuard - PHASE 2
 *
 * Guard for controller endpoints requiring canInteract check.
 * Use with @RequireInteraction(action) decorator.
 *
 * Example:
 * @RequireInteraction(PermissionAction.MESSAGE)
 * @Post('message/:targetUserId')
 * async sendMessage(...) {}
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InteractionAuthorizationService } from '../services/interaction-authorization.service';
import { extractTargetUserId } from '@common/guards/guard.helper';
import {
  PermissionAction,
  PermissionActionType,
} from '@common/constants/permission-actions.constant';

export const REQUIRE_INTERACTION_KEY = 'requireInteraction';

@Injectable()
export class InteractionGuard implements CanActivate {
  constructor(
    private readonly interactionAuth: InteractionAuthorizationService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<PermissionActionType>(
      REQUIRE_INTERACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!action) return true;

    const request = context.switchToHttp().getRequest();
    const currentUser = request.user;

    if (!currentUser) {
      throw new ForbiddenException('Authentication required');
    }

    let targetUserId: string;
    try {
      targetUserId = extractTargetUserId(context);
    } catch {
      return true;
    }

    const result = await this.interactionAuth.canInteract(
      currentUser.id,
      targetUserId,
      action,
    );

    if (!result.allowed) {
      throw new ForbiddenException(result.reason ?? 'Action not allowed');
    }

    return true;
  }
}

export const RequireInteraction = (action: PermissionActionType) =>
  SetMetadata(REQUIRE_INTERACTION_KEY, action);
