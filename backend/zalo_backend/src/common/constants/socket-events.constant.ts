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

  //Client → Server
  MESSAGE_SEND: 'message:send',
  MESSAGE_DELIVERED_ACK: 'message:delivered', // Client confirms delivery
  MESSAGE_SEEN: 'message:seen',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // Server → Client
  MESSAGE_NEW: 'message:new', // New incoming message
  MESSAGE_SENT_ACK: 'message:sent', // Server confirms send
  MESSAGE_RECEIPT_UPDATE: 'message:receipt', // Delivery/seen status change
  TYPING_STATUS: 'typing:status', // Someone is typing

  // Sync events
  MESSAGES_SYNC: 'messages:sync', // Offline message batch
  CONVERSATION_UPDATED: 'conversation:updated', // Last message changed
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
