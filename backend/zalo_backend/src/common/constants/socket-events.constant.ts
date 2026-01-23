/**
 * WebSocket Event Names
 * Centralized constants to prevent typos and ensure consistency
 */

export const SocketEvents = {
  // Connection lifecycle
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  DISCONNECTING: 'disconnecting',

  // Authentication
  AUTHENTICATED: 'authenticated',
  AUTH_FAILED: 'auth_failed',

  // Server events
  SERVER_SHUTDOWN: 'server:shutdown',
  SERVER_MAINTENANCE: 'server:maintenance',

  // Presence events
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  FRIEND_ONLINE: 'friend:online',
  FRIEND_OFFLINE: 'friend:offline',

  // Error events
  ERROR: 'error',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',

  // Heartbeat (handled by Socket.IO internally)
  PING: 'ping',
  PONG: 'pong',
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
