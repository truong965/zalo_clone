/**
 * PermissionAction Enum
 *
 * Single source of truth for all permission/interaction actions
 * Used by: Privacy module, Interaction authorization, Guards
 *
 * PHASE 7: Centralized action types to avoid hard-coding across modules
 */

export enum PermissionAction {
  /** User sending a message */
  MESSAGE = 'message',

  /** User initiating a call */
  CALL = 'call',

  /** User viewing profile */
  PROFILE = 'profile',

  /** User sending friend request */
  FRIEND_REQUEST = 'friend_request',

  /** Action allowed only between friends (e.g. view private photos) */
  FRIENDS_ONLY = 'friends_only',
}

/**
 * Type guard: Extract all valid actions
 */
export const ALL_PERMISSION_ACTIONS = Object.values(PermissionAction);

/**
 * Type: PermissionActionType
 * Use instead of 'message' | 'call' | 'profile'
 */
export type PermissionActionType = `${PermissionAction}`;
