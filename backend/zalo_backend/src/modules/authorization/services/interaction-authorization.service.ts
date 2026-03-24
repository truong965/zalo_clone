/**
 * InteractionAuthorizationService - PHASE 2
 *
 * Centralized canInteract() for user interactions.
 * Used by: Messaging, Call, Profile (guards); Friend request uses BlockChecker from BlockModule directly.
 *
 * Logic:
 * - requesterId === targetId → true
 * - Block check (BlockCheckerService) → if blocked, false
 * - friend_request → true (only block check)
 * - message, call, profile → Privacy settings + areFriends
 */

import { Inject, Injectable } from '@nestjs/common';
import type { IBlockChecker } from '@modules/block/services/block-checker.interface';
import { BLOCK_CHECKER } from '@modules/block/services/block-checker.interface';
import {
  PermissionAction,
  PermissionActionType,
} from '@common/constants/permission-actions.constant';
import { PrivacyLevel } from '@prisma/client';
import type { PrivacySettingsResponseDto } from '@modules/privacy/dto/privacy.dto';
import {
  CanInteractResult,
  FRIENDSHIP_READ_PORT,
  PRIVACY_READ_PORT,
} from '@common/contracts/internal-api';
import type {
  IFriendshipReadPort,
  IPrivacyReadPort,
} from '@common/contracts/internal-api';

@Injectable()
export class InteractionAuthorizationService {
  constructor(
    @Inject(BLOCK_CHECKER)
    private readonly blockChecker: IBlockChecker,
    @Inject(PRIVACY_READ_PORT)
    private readonly privacyRead: IPrivacyReadPort,
    @Inject(FRIENDSHIP_READ_PORT)
    private readonly friendshipRead: IFriendshipReadPort,
  ) {}

  /**
   * Check if requester can perform action on target.
   */
  async canInteract(
    requesterId: string,
    targetId: string,
    action: PermissionActionType,
  ): Promise<CanInteractResult> {
    const resolvedAction = this.resolvePermissionAction(action);
    if (!resolvedAction) {
      return { allowed: false, reason: 'Unknown action' };
    }

    if (requesterId === targetId) {
      return { allowed: true };
    }

    const isBlocked = await this.blockChecker.isBlocked(requesterId, targetId);
    if (isBlocked) {
      return { allowed: false, reason: 'User is blocked' };
    }

    if (resolvedAction === PermissionAction.FRIEND_REQUEST) {
      return { allowed: true };
    }

    if (resolvedAction === PermissionAction.FRIENDS_ONLY) {
      const areFriends = await this.friendshipRead.areFriends(
        requesterId,
        targetId,
      );
      return areFriends
        ? { allowed: true }
        : {
            allowed: false,
            reason: 'This action requires friendship',
          };
    }

    if (
      resolvedAction === PermissionAction.MESSAGE ||
      resolvedAction === PermissionAction.CALL ||
      resolvedAction === PermissionAction.PROFILE
    ) {
      const settings = await this.privacyRead.getSettings(targetId);
      const privacyLevel = this.getPrivacyLevelForAction(
        resolvedAction,
        settings,
      );

      if (privacyLevel === PrivacyLevel.EVERYONE) {
        return { allowed: true };
      }

      if (privacyLevel === PrivacyLevel.CONTACTS) {
        const areFriends = await this.friendshipRead.areFriends(
          requesterId,
          targetId,
        );
        return areFriends
          ? { allowed: true }
          : {
              allowed: false,
              reason: 'User privacy settings require friendship',
            };
      }

      return {
        allowed: false,
        reason: 'User privacy settings do not allow this action',
      };
    }

    return { allowed: false, reason: 'Unknown action' };
  }

  private resolvePermissionAction(
    action: PermissionActionType,
  ): PermissionAction | undefined {
    switch (action) {
      case 'message':
        return PermissionAction.MESSAGE;
      case 'call':
        return PermissionAction.CALL;
      case 'profile':
        return PermissionAction.PROFILE;
      case 'friend_request':
        return PermissionAction.FRIEND_REQUEST;
      case 'friends_only':
        return PermissionAction.FRIENDS_ONLY;
      default:
        return undefined;
    }
  }

  private getPrivacyLevelForAction(
    action: PermissionAction,
    settings: PrivacySettingsResponseDto,
  ): PrivacyLevel {
    switch (action) {
      case PermissionAction.MESSAGE:
        return settings.whoCanMessageMe;
      case PermissionAction.CALL:
        return settings.whoCanCallMe;
      case PermissionAction.PROFILE:
        return settings.showProfile;
      default:
        return PrivacyLevel.EVERYONE;
    }
  }

  /** Convenience: Can requester message target? */
  async canMessage(requesterId: string, targetId: string): Promise<boolean> {
    const result = await this.canInteract(
      requesterId,
      targetId,
      PermissionAction.MESSAGE,
    );
    return result.allowed;
  }

  /** Convenience: Can requester call target? */
  async canCall(requesterId: string, targetId: string): Promise<boolean> {
    const result = await this.canInteract(
      requesterId,
      targetId,
      PermissionAction.CALL,
    );
    return result.allowed;
  }

  /** Convenience: Can requester view target's profile? */
  async canViewProfile(
    requesterId: string,
    targetId: string,
  ): Promise<boolean> {
    const result = await this.canInteract(
      requesterId,
      targetId,
      PermissionAction.PROFILE,
    );
    return result.allowed;
  }

  /**
   * Check if there is a block between two users (either direction).
   * Used by NotBlockedGuard for backward compatibility.
   */
  async isBlocked(userId1: string, userId2: string): Promise<boolean> {
    return this.blockChecker.isBlocked(userId1, userId2);
  }
}
