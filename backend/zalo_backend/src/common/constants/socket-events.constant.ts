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
  AI_TRANSLATE: 'ai:translate',
  AI_SUMMARY: 'ai:summary',
  AI_STREAM_START: 'ai:stream-start',
  AI_STREAM_CHUNK: 'ai:stream-chunk',
  AI_STREAM_DONE: 'ai:stream-done',
  AI_STREAM_ERROR: 'ai:stream-error',
  AI_RESPONSE_STARTED: 'ai.response.started',
  AI_RESPONSE_PROGRESS: 'ai.response.progress',
  AI_RESPONSE_DELTA: 'ai.response.delta',
  AI_RESPONSE_COMPLETED: 'ai.response.completed',
  AI_RESPONSE_ERROR: 'ai.response.error',

  // Sync events
  MESSAGES_SYNC: 'messages:sync', // Offline message batch
  CONVERSATION_UPDATED: 'conversation:updated', // Last message changed

  CONVERSATION_LIST_ITEM_UPDATED: 'conversation:list:itemUpdated',

  // === CONVERSATION PIN EVENTS (Server → Client) ===
  CONVERSATION_PINNED: 'conversation:pinned',
  CONVERSATION_UNPINNED: 'conversation:unpinned',

  // Pin Message (conversation-level — works for both DIRECT + GROUP)
  CONVERSATION_PIN_MESSAGE: 'conversation:pinMessage',
  CONVERSATION_UNPIN_MESSAGE: 'conversation:unpinMessage',
  CONVERSATION_MESSAGE_PINNED: 'conversation:messagePinned',
  CONVERSATION_MESSAGE_UNPINNED: 'conversation:messageUnpinned',

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
  SEARCH_SUBSCRIBE: 'search:subscribe', // Subscribe to real-time search updates
  SEARCH_UNSUBSCRIBE: 'search:unsubscribe', // Unsubscribe from search updates
  SEARCH_UPDATE_QUERY: 'search:updateQuery', // Update search query (debounced)
  SEARCH_LOAD_MORE: 'search:loadMore', // Load more results (pagination)

  // Server → Client
  SEARCH_RESULTS: 'search:results', // Initial search results
  SEARCH_MORE_RESULTS: 'search:moreResults', // Paginated results (load more)
  SEARCH_NEW_MATCH: 'search:newMatch', // New message matches active search
  SEARCH_RESULT_REMOVED: 'search:resultRemoved', // Result removed (deleted message)
  SEARCH_SUGGESTIONS: 'search:suggestions', // Autocomplete suggestions
  SEARCH_ERROR: 'search:error', // Search error notification

  // === SOCKET LIFECYCLE (server-to-server internal presence) ===
  SERVER_HEARTBEAT: 'server_heartbeat',
  AUTH_FORCE_LOGOUT: 'auth.force_logout',

  // === QR LOGIN EVENTS (Server → Web, targeted by socketId) ===
  QR_SCANNED: 'qr.scanned',
  QR_APPROVED: 'qr.approved',
  QR_EXPIRED: 'qr.expired',
  QR_CANCELLED: 'qr.cancelled',

  // === FRIENDSHIP EVENTS (Server → Client) ===
  FRIEND_REQUEST_RECEIVED: 'friendship:requestReceived',
  FRIEND_REQUEST_ACCEPTED: 'friendship:requestAccepted',
  FRIEND_REQUEST_CANCELLED: 'friendship:requestCancelled',
  FRIEND_REQUEST_DECLINED: 'friendship:requestDeclined',
  FRIEND_UNFRIENDED: 'friendship:unfriended',

  // === CONTACT EVENTS (Server → Client) ===
  /** Owner's alias for a contact was updated; only sent to the owner */
  CONTACT_ALIAS_UPDATED: 'contact:aliasUpdated',

  // === CALL EVENTS ===

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
  CALL_MEDIA_STATE: 'call:media-state',
  CALL_SWITCH_TO_DAILY: 'call:switch-to-daily',
  CALL_JOIN_EXISTING: 'call:join-existing',
  CALL_HEARTBEAT: 'call:heartbeat',

  // Server → Client
  CALL_INCOMING: 'call:incoming',
  CALL_ACCEPTED: 'call:accepted',
  CALL_REJECTED: 'call:rejected',
  CALL_ENDED: 'call:ended',
  CALL_BUSY: 'call:busy',
  CALL_OFFER_RELAY: 'call:offer',
  CALL_ANSWER_RELAY: 'call:answer',
  CALL_ICE_CANDIDATE_RELAY: 'call:ice-candidate',
  CALL_DAILY_ROOM: 'call:daily-room',
  CALL_CALLER_DISCONNECTED: 'call:caller-disconnected',
  CALL_QUALITY_CHANGE: 'call:quality-change',
  CALL_PARTICIPANT_JOINED: 'call:participant-joined',
  CALL_PARTICIPANT_LEFT: 'call:participant-left',
  GROUP_CALL_STARTED: 'group:call-started',
  GROUP_CALL_ENDED: 'group:call-ended',

  // === REMINDER EVENTS ===
  /** Server → Client: Reminder time has arrived */
  REMINDER_TRIGGERED: 'reminder:triggered',
  /** Server → Client: Reminder list changed (created/updated/deleted) */
  REMINDER_UPDATED: 'reminder:updated',

  // === CONVERSATION PREFERENCE EVENTS (Server → Client, personal) ===
  /** User archived/unarchived a conversation (cross-device sync) */
  CONVERSATION_ARCHIVED: 'conversation:archived',
  /** User muted/unmuted a conversation (cross-device sync) */
  CONVERSATION_MUTED: 'conversation:muted',

  // === BLOCK EVENTS ===
  USER_BLOCKED: 'user:blocked',
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
