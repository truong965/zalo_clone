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

  // Search
  SEARCH_SUBSCRIBE: 'search:subscribe',
  SEARCH_UNSUBSCRIBE: 'search:unsubscribe',
  SEARCH_UPDATE_QUERY: 'search:updateQuery',
  SEARCH_RESULTS: 'search:results',
  SEARCH_MORE_RESULTS: 'search:moreResults',
  SEARCH_NEW_MATCH: 'search:newMatch',
  SEARCH_RESULT_REMOVED: 'search:resultRemoved',
  SEARCH_SUGGESTIONS: 'search:suggestions',
  SEARCH_LOAD_MORE: 'search:loadMore',
  SEARCH_ERROR: 'search:error',

  // Group
  GROUP_CREATE: 'group:create',
  GROUP_UPDATE: 'group:update',
  GROUP_DISSOLVE: 'group:dissolve',
  GROUP_LEAVE: 'group:leave',
  GROUP_ADD_MEMBERS: 'group:addMembers',
  GROUP_REMOVE_MEMBER: 'group:removeMember',
  GROUP_TRANSFER_ADMIN: 'group:transferAdmin',
  
  // Group (Server -> Client)
  GROUP_UPDATED: 'group:updated',
  GROUP_MEMBERS_ADDED: 'group:membersAdded',
  GROUP_MEMBER_REMOVED: 'group:memberRemoved',
  GROUP_MEMBER_LEFT: 'group:memberLeft',
  GROUP_ADMIN_TRANSFERRED: 'group:adminTransferred',
  GROUP_DISSOLVED: 'group:dissolved',
  GROUP_JOIN_REQUEST_RECEIVED: 'group:joinRequestReceived',
  GROUP_JOIN_REQUEST_REVIEWED: 'group:joinRequestReviewed',
  GROUP_MEMBER_JOINED: 'group:memberJoined',
  GROUP_YOU_WERE_REMOVED: 'group:youWereRemoved',
  USER_BLOCKED: 'user:blocked',

  // Call
  CALL_INITIATE: 'call:initiate',
  CALL_INCOMING: 'call:incoming',
  CALL_ACCEPT: 'call:accept',
  CALL_ACCEPTED: 'call:accepted',
  CALL_REJECT: 'call:reject',
  CALL_REJECTED: 'call:rejected',
  CALL_HANGUP: 'call:hangup',
  CALL_ENDED: 'call:ended',
  CALL_BUSY: 'call:busy',
  CALL_RINGING_ACK: 'call:ringing-ack',
  CALL_OFFER: 'call:offer',
  CALL_ANSWER: 'call:answer',
  CALL_ICE_CANDIDATE: 'call:ice-candidate',
  CALL_MEDIA_STATE: 'call:media-state',
  CALL_ICE_RESTART: 'call:ice-restart',
  CALL_CALLER_DISCONNECTED: 'call:caller-disconnected',
  CALL_QUALITY_CHANGE: 'call:quality-change',
  CALL_DAILY_ROOM: 'call:daily-room',
  CALL_SWITCH_TO_DAILY: 'call:switch-to-daily',
  CALL_PARTICIPANT_JOINED: 'call:participant-joined',
  CALL_PARTICIPANT_LEFT: 'call:participant-left',
  CALL_JOIN_EXISTING: 'call:join-existing',
  GROUP_CALL_STARTED: 'group:call-started',
  GROUP_CALL_ENDED: 'group:call-ended',
  CALL_HEARTBEAT: 'call:heartbeat',

  // Friendship
  FRIEND_REQUEST_RECEIVED: 'friendship:requestReceived',
  FRIEND_REQUEST_ACCEPTED: 'friendship:requestAccepted',
  FRIEND_REQUEST_CANCELLED: 'friendship:requestCancelled',
  FRIEND_REQUEST_DECLINED: 'friendship:requestDeclined',
  FRI_UNFRIENDED: 'friendship:unfriended',
} as const;
