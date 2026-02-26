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
      CONVERSATION_READ: 'conversation:read', // Group member read conversation
      TYPING_STATUS: 'typing:status', // Someone is typing

      // Sync events
      MESSAGES_SYNC: 'messages:sync', // Offline message batch
      CONVERSATION_UPDATED: 'conversation:updated', // Last message changed

      CONVERSATION_LIST_ITEM_UPDATED: 'conversation:list:itemUpdated',

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
      GROUP_INVITE_MEMBERS: 'group:inviteMembers',

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

      // === SEARCH EVENTS (Phase 4: Real-Time Search) ===

      // Client → Server
      SEARCH_SUBSCRIBE: 'search:subscribe',
      SEARCH_UNSUBSCRIBE: 'search:unsubscribe',
      SEARCH_UPDATE_QUERY: 'search:updateQuery',
      SEARCH_LOAD_MORE: 'search:loadMore',

      // Server → Client
      SEARCH_RESULTS: 'search:results',
      SEARCH_MORE_RESULTS: 'search:moreResults',
      SEARCH_NEW_MATCH: 'search:newMatch',
      SEARCH_RESULT_REMOVED: 'search:resultRemoved',
      SEARCH_SUGGESTIONS: 'search:suggestions',
      SEARCH_ERROR: 'search:error',

      // === CALL EVENTS (Phase 3: WebRTC P2P 1-1) ===

      // Client → Server
      CALL_INITIATE: 'call:initiate',
      CALL_ACCEPT: 'call:accept',
      CALL_REJECT: 'call:reject',
      CALL_HANGUP: 'call:hangup',
      CALL_OFFER: 'call:offer',
      CALL_ANSWER: 'call:answer',
      CALL_ICE_CANDIDATE: 'call:ice-candidate',
      CALL_ICE_RESTART: 'call:ice-restart',
      CALL_RINGING_ACK: 'call:ringing-ack',
      // Phase 4: Daily.co SFU fallback
      CALL_SWITCH_TO_DAILY: 'call:switch-to-daily',

      // Server → Client
      CALL_INCOMING: 'call:incoming',
      CALL_ACCEPTED: 'call:accepted',
      CALL_REJECTED: 'call:rejected',
      CALL_ENDED: 'call:ended',
      CALL_BUSY: 'call:busy',
      // Phase 4: Daily.co room info
      CALL_DAILY_ROOM: 'call:daily-room',
      CALL_PARTICIPANT_JOINED: 'call:participant-joined',
      CALL_PARTICIPANT_LEFT: 'call:participant-left',
      CALL_CALLER_DISCONNECTED: 'call:caller-disconnected',
      CALL_QUALITY_CHANGE: 'call:quality-change',
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
