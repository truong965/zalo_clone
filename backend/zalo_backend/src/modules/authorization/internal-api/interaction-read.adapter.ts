import { Injectable } from '@nestjs/common';
import {
      CanInteractResult,
      IInteractionReadPort,
} from '@common/contracts/internal-api';
import type { PermissionActionType } from '@common/constants/permission-actions.constant';
import { InteractionAuthorizationService } from '../services/interaction-authorization.service';

@Injectable()
export class InteractionReadAdapter implements IInteractionReadPort {
      constructor(
            private readonly interactionAuthorizationService: InteractionAuthorizationService,
      ) { }

      canInteract(
            requesterId: string,
            targetId: string,
            action: PermissionActionType,
      ): Promise<CanInteractResult> {
            return this.interactionAuthorizationService.canInteract(
                  requesterId,
                  targetId,
                  action,
            );
      }

      canMessage(requesterId: string, targetId: string): Promise<boolean> {
            return this.interactionAuthorizationService.canMessage(requesterId, targetId);
      }

      canCall(requesterId: string, targetId: string): Promise<boolean> {
            return this.interactionAuthorizationService.canCall(requesterId, targetId);
      }

      canViewProfile(requesterId: string, targetId: string): Promise<boolean> {
            return this.interactionAuthorizationService.canViewProfile(
                  requesterId,
                  targetId,
            );
      }

      isBlocked(userId1: string, userId2: string): Promise<boolean> {
            return this.interactionAuthorizationService.isBlocked(userId1, userId2);
      }
}
