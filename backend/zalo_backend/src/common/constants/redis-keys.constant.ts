/**
 * Redis Key Patterns
 * Follow naming convention: {prefix}:{entity}:{id}:{attribute}
 */

export const RedisKeys = {
  // Socket Registry
  userSockets: (userId: string) => `user:${userId}:sockets`,
  socketUser: (socketId: string) => `socket:${socketId}:user`,

  // Presence
  onlineUsers: () => 'presence:online_users',
  userStatus: (userId: string) => `user:${userId}:status`,
  userDevices: (userId: string) => `user:${userId}:devices`,
  // Pub/Sub Channels
  channels: {
    message: 'socket:message',
    presenceOnline: 'socket:presence:online',
    presenceOffline: 'socket:presence:offline',
    broadcast: 'socket:broadcast',
    // typing: 'socket:typing',
    newMessage: (conversationId: string) => `chat:msg:${conversationId}`,
    receipt: (userId: string) => `chat:receipt:${userId}`,
    typing: (conversationId: string) => `chat:typing:${conversationId}`,
  },
  cache: {
    //  Message idempotency (TTL: 5min)
    messageIdempotency: (clientMsgId: string) => `msg:dedup:${clientMsgId}`,

    // Offline message queue (sorted set)
    offlineMessages: (userId: string) => `user:${userId}:offline_msgs`,
  },
  // [NEW] SOCIAL GRAPH MODULE KEYS
  social: {
    // Friendship
    friendship: (user1: string, user2: string) =>
      `social:friendship:${user1}:${user2}`,
    friendCount: (userId: string, status: string) =>
      `social:friend_count:${userId}:${status}`,

    // Block
    block: (user1: string, user2: string) => `social:block:${user1}:${user2}`,

    // Privacy
    privacySettings: (userId: string) => `social:privacy:${userId}`,

    // Permission Checks (Cached Results)
    permission: (
      action: 'message' | 'call' | 'profile',
      requester: string,
      target: string,
    ) => `social:perm:${action}:${requester}:${target}`,
    // Contact
    contactName: (ownerId: string, contactId: string) =>
      `contact:name:${ownerId}:${contactId}`,

    // Call
    activeCall: (callId: string) => `call:session:${callId}`,
    userActiveCalls: (userId: string) => `call:user:${userId}:active`,
    callEndLock: (callId: string) => `call:end_lock:${callId}`,
    callResult: (callId: string) => `call:result:${callId}`,
    missedCallsViewedAt: (userId: string) => `call:missed:viewed_at:${userId}`,
    missedCallsCount: (userId: string) => `call:missed:count:${userId}`,
  },
  rateLimit: {
    contactSync: (userId: string) => `ratelimit:contact_sync:${userId}`,
    // Rate Limiting
    rateLimitMessages: (userId: string) => `rate_limit:${userId}:messages`,
    rateLimitEvents: (socketId: string) =>
      `rate_limit:socket:${socketId}:events`,
    // [NEW] Social Rate Limits
    rateLimitFriendRequest: (userId: string, period: 'daily' | 'weekly') =>
      `ratelimit:friend_request:${userId}:${period}`,
  },
} as const;

/**
 * Helper to build Redis keys safely
 */
export class RedisKeyBuilder {
  static userSockets(userId: string): string {
    return RedisKeys.userSockets(userId);
  }

  static socketUser(socketId: string): string {
    return RedisKeys.socketUser(socketId);
  }

  static userStatus(userId: string): string {
    return RedisKeys.userStatus(userId);
  }

  static userDevices(userId: string): string {
    return RedisKeys.userDevices(userId);
  }

  static rateLimitMessages(userId: string): string {
    return RedisKeys.rateLimit.rateLimitMessages(userId);
  }

  static rateLimitEvents(socketId: string): string {
    return RedisKeys.rateLimit.rateLimitEvents(socketId);
  }
  // --- [NEW] Social Methods ---

  static rateLimitFriendRequest(
    userId: string,
    period: 'daily' | 'weekly',
  ): string {
    return RedisKeys.rateLimit.rateLimitFriendRequest(userId, period);
  }

  static socialFriendship(user1Id: string, user2Id: string): string {
    // Ensure canonical ordering for consistent keys
    const [u1, u2] =
      user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
    return RedisKeys.social.friendship(u1, u2);
  }

  static socialFriendCount(
    userId: string,
    status: 'ACCEPTED' | 'PENDING' | 'DECLINED' = 'ACCEPTED',
  ): string {
    return RedisKeys.social.friendCount(userId, status);
  }

  static socialBlock(user1Id: string, user2Id: string): string {
    const [u1, u2] =
      user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
    return RedisKeys.social.block(u1, u2);
  }

  static socialPrivacy(userId: string): string {
    return RedisKeys.social.privacySettings(userId);
  }

  static socialPermission(
    action: 'message' | 'call' | 'profile',
    requesterId: string,
    targetId: string,
  ): string {
    return RedisKeys.social.permission(action, requesterId, targetId);
  }
  static contactName(ownerId: string, contactId: string): string {
    return RedisKeys.social.contactName(ownerId, contactId);
  }

  static activeCall(callId: string): string {
    return RedisKeys.social.activeCall(callId);
  }

  static userActiveCalls(userId: string): string {
    return RedisKeys.social.userActiveCalls(userId);
  }

  static rateLimitContactSync(userId: string): string {
    return RedisKeys.rateLimit.contactSync(userId);
  }
}
