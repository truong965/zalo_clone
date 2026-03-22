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
  MESSAGE_SEND: 'message:send',
  MESSAGE_SENT_ACK: 'message:sent', // The backend uses 'message:sent' for ack
  MESSAGE_DELIVERED_ACK: 'message:delivered',
  MESSAGE_DELIVERED_CLIENT_ACK: 'message:delivered:ack',
  MESSAGE_SEEN: 'message:seen',
  MESSAGE_RECEIPT_UPDATE: 'message:receipt',
  CONVERSATION_READ: 'conversation:read',
  CONVERSATION_PIN_MESSAGE: 'conversation:pinMessage',
  CONVERSATION_UNPIN_MESSAGE: 'conversation:unpinMessage',
  CONVERSATION_MESSAGE_PINNED: 'conversation:messagePinned',
  CONVERSATION_MESSAGE_UNPINNED: 'conversation:messageUnpinned',
  MESSAGES_SYNC: 'messages:sync',
  
  // Presence
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',
  FRIEND_ONLINE: 'friend:online',
  FRIEND_OFFLINE: 'friend:offline',
  
  // ERROR
  ERROR: 'error',
} as const;
