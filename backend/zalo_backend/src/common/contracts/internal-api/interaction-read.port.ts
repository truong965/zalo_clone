import type { PermissionActionType } from '@common/constants/permission-actions.constant';

export const INTERACTION_READ_PORT = Symbol('INTERACTION_READ_PORT');

export interface CanInteractResult {
      allowed: boolean;
      reason?: string;
}

/**
 * Aggregate policy-read contract for cross-domain authorization checks.
 */
export interface IInteractionReadPort {
      canInteract(
            requesterId: string,
            targetId: string,
            action: PermissionActionType,
      ): Promise<CanInteractResult>;

      canMessage(requesterId: string, targetId: string): Promise<boolean>;

      canCall(requesterId: string, targetId: string): Promise<boolean>;

      canViewProfile(requesterId: string, targetId: string): Promise<boolean>;

      isBlocked(userId1: string, userId2: string): Promise<boolean>;
}
