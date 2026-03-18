export const SocketEvents = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  
  // Auth
  AUTHENTICATED: 'authenticated',
  AUTH_FAILED: 'auth_failed',

  // Conversation
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_MUTED: 'conversation:muted',
  CONVERSATION_PINNED: 'conversation:pinned',
  CONVERSATION_UNPINNED: 'conversation:unpinned',
  CONVERSATION_LIST_ITEM_UPDATED: 'conversation:list:itemUpdated',
  
  // Message
  MESSAGE_NEW: 'message:new',
  MESSAGE_SENT: 'message:sent',
  MESSAGE_RECEIPT: 'message:receipt',
  
  // Presence
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
} as const;
