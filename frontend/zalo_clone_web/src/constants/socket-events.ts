/**
 * QUAN TRỌNG: Tất cả tên sự kiện Socket phải khớp với Backend NestJS
 * Tránh typo bằng cách sử dụng constant
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
      MESSAGE_DELIVERED_ACK: 'message:delivered',
      MESSAGE_DELIVERED_CLIENT_ACK: 'message:delivered:ack',
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

      // === GROUP EVENTS ===

      // Client → Server
      GROUP_CREATE: 'group:create',
      GROUP_UPDATE: 'group:update',
      GROUP_ADD_MEMBERS: 'group:addMembers',
      GROUP_REMOVE_MEMBER: 'group:removeMember',
      GROUP_LEAVE: 'group:leave',
      GROUP_TRANSFER_ADMIN: 'group:transferAdmin',
      GROUP_DISSOLVE: 'group:dissolve',
      GROUP_PIN_MESSAGE: 'group:pinMessage',
      GROUP_UNPIN_MESSAGE: 'group:unpinMessage',

      // Join Requests
      GROUP_REQUEST_JOIN: 'group:requestJoin',
      GROUP_REVIEW_JOIN: 'group:reviewJoinRequest',
      GROUP_GET_PENDING: 'group:getPendingRequests',
      GROUP_CANCEL_REQUEST: 'group:cancelJoinRequest',

      // Server → Client
      GROUP_CREATED: 'group:created',
      GROUP_UPDATED: 'group:updated',
      GROUP_MEMBERS_ADDED: 'group:membersAdded',
      GROUP_MEMBER_REMOVED: 'group:memberRemoved',
      GROUP_MEMBER_LEFT: 'group:memberLeft',
      GROUP_YOU_WERE_REMOVED: 'group:youWereRemoved',
      GROUP_ADMIN_TRANSFERRED: 'group:adminTransferred',
      GROUP_DISSOLVED: 'group:dissolved',
      GROUP_MESSAGE_PINNED: 'group:messagePinned',
      GROUP_MESSAGE_UNPINNED: 'group:messageUnpinned',

      // Join Request Notifications
      GROUP_JOIN_REQUEST_RECEIVED: 'group:joinRequestReceived',
      GROUP_JOIN_REQUEST_REVIEWED: 'group:joinRequestReviewed',
      GROUP_MEMBER_JOINED: 'group:memberJoined',
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
