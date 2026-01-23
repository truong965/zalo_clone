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

  // Rate Limiting
  rateLimitMessages: (userId: string) => `rate_limit:${userId}:messages`,
  rateLimitEvents: (socketId: string) => `rate_limit:socket:${socketId}:events`,

  // Pub/Sub Channels
  channels: {
    message: 'socket:message',
    presenceOnline: 'socket:presence:online',
    presenceOffline: 'socket:presence:offline',
    broadcast: 'socket:broadcast',
    typing: 'socket:typing',
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
    return RedisKeys.rateLimitMessages(userId);
  }

  static rateLimitEvents(socketId: string): string {
    return RedisKeys.rateLimitEvents(socketId);
  }
}
