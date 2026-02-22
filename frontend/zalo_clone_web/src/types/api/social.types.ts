/**
 * Social Graph Module Types
 *
 * Friendship, blocks, user contacts and domain events.
 */

// ============================================================================
// ENUMS
// ============================================================================

export const FriendshipStatus = {
      PENDING: 'PENDING',
      ACCEPTED: 'ACCEPTED',
      DECLINED: 'DECLINED',
      CANCELLED: 'CANCELLED',
} as const;

export type FriendshipStatus = (typeof FriendshipStatus)[keyof typeof FriendshipStatus];


export const EventType = {
      // Block Domain
      USER_BLOCKED: 'USER_BLOCKED',
      USER_UNBLOCKED: 'USER_UNBLOCKED',

      // Social Domain
      FRIEND_REQUEST_SENT: 'FRIEND_REQUEST_SENT',
      FRIEND_REQUEST_ACCEPTED: 'FRIEND_REQUEST_ACCEPTED',
      FRIEND_REQUEST_REJECTED: 'FRIEND_REQUEST_REJECTED',
      FRIEND_REQUEST_CANCELLED: 'FRIEND_REQUEST_CANCELLED',
      UNFRIENDED: 'UNFRIENDED',

      // Messaging Domain
      MESSAGE_SENT: 'MESSAGE_SENT',
      CONVERSATION_CREATED: 'CONVERSATION_CREATED',
      CONVERSATION_MEMBER_ADDED: 'CONVERSATION_MEMBER_ADDED',
      CONVERSATION_MEMBER_LEFT: 'CONVERSATION_MEMBER_LEFT',
      CONVERSATION_MEMBER_PROMOTED: 'CONVERSATION_MEMBER_PROMOTED',
      CONVERSATION_MEMBER_DEMOTED: 'CONVERSATION_MEMBER_DEMOTED',
      GROUP_CREATED: 'GROUP_CREATED',
      MESSAGE_DELIVERED: 'MESSAGE_DELIVERED',
      MESSAGE_SEEN: 'MESSAGE_SEEN',

      // Call Domain
      CALL_INITIATED: 'CALL_INITIATED',
      CALL_ANSWERED: 'CALL_ANSWERED',
      CALL_ENDED: 'CALL_ENDED',
      CALL_REJECTED: 'CALL_REJECTED',

      // Auth Domain
      USER_REGISTERED: 'USER_REGISTERED',
      USER_PROFILE_UPDATED: 'USER_PROFILE_UPDATED',

      // Presence Domain
      USER_WENT_ONLINE: 'USER_WENT_ONLINE',
      USER_WENT_OFFLINE: 'USER_WENT_OFFLINE',

      // Privacy Domain
      PRIVACY_SETTINGS_UPDATED: 'PRIVACY_SETTINGS_UPDATED',

      // Contact Domain
      CONTACT_SYNCED: 'CONTACT_SYNCED',
      CONTACT_ADDED: 'CONTACT_ADDED',
      CONTACT_REMOVED: 'CONTACT_REMOVED',

      // Notifications Domain
      NOTIFICATION_SENT: 'NOTIFICATION_SENT',

      // Media Domain
      MEDIA_UPLOADED: 'MEDIA_UPLOADED',
      MEDIA_DELETED: 'MEDIA_DELETED',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

// ============================================================================
// ENTITIES
// ============================================================================

export interface Friendship {
      id: string;
      user1Id: string;
      user2Id: string;
      requesterId: string;
      status: FriendshipStatus;
      acceptedAt?: string;
      declinedAt?: string;
      expiresAt?: string;
      lastActionAt?: string;
      lastActionBy?: string;
      createdAt: string;
      updatedAt: string;
      deletedAt?: string;
}

export interface Block {
      id: string;
      blockerId: string;
      blockedId: string;
      reason?: string;
      createdAt: string;
}

/** Item returned by GET /block/blocked (cursor-paginated) */
export interface BlockedUserItem {
      blockId: string;
      userId: string;
      displayName: string;
      avatarUrl?: string;
      blockedAt: string;
      reason?: string;
}

export interface UserContact {
      id: string;
      ownerId: string;
      contactUserId: string;
      aliasName?: string;
      createdAt: string;
      updatedAt: string;
}
