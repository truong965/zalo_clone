/**
 * QUAN TRỌNG: Tất cả tên sự kiện Socket phải khớp với Backend NestJS
 * Tránh typo bằng cách sử dụng constant
 */

// Client emit to Server
export const SOCKET_EMIT = {
      // Connection
      CONNECT_USER: 'connect_user',
      DISCONNECT_USER: 'disconnect_user',

      // Chat
      SEND_MESSAGE: 'send_message',
      EDIT_MESSAGE: 'edit_message',
      DELETE_MESSAGE: 'delete_message',
      TYPING: 'typing',
      STOP_TYPING: 'stop_typing',
      READ_MESSAGE: 'read_message',

      // Call
      INITIATE_CALL: 'initiate_call',
      ACCEPT_CALL: 'accept_call',
      REJECT_CALL: 'reject_call',
      END_CALL: 'end_call',
      SEND_ICE_CANDIDATE: 'send_ice_candidate',
      SEND_OFFER: 'send_offer',
      SEND_ANSWER: 'send_answer',

      // Friend
      FRIEND_REQUEST: 'friend_request',
      FRIEND_REQUEST_ACCEPTED: 'friend_request_accepted',
      FRIEND_REQUEST_REJECTED: 'friend_request_rejected',
      FRIEND_REMOVED: 'friend_removed',

      // Block
      BLOCK_USER: 'block_user',
      UNBLOCK_USER: 'unblock_user',

      // Status
      USER_ONLINE: 'user_online',
      USER_OFFLINE: 'user_offline',
} as const;

// Server emit to Client
export const SOCKET_ON = {
      // Connection
      CONNECTED: 'connected',
      DISCONNECTED: 'disconnected',

      // Chat
      MESSAGE_RECEIVED: 'message_received',
      MESSAGE_EDITED: 'message_edited',
      MESSAGE_DELETED: 'message_deleted',
      TYPING: 'typing',
      STOP_TYPING: 'stop_typing',
      MESSAGE_READ: 'message_read',

      // Call
      INCOMING_CALL: 'incoming_call',
      CALL_ACCEPTED: 'call_accepted',
      CALL_REJECTED: 'call_rejected',
      CALL_ENDED: 'call_ended',
      ICE_CANDIDATE: 'ice_candidate',
      OFFER: 'offer',
      ANSWER: 'answer',

      // Friend
      FRIEND_REQUEST_RECEIVED: 'friend_request_received',
      FRIEND_REQUEST_ACCEPTED: 'friend_request_accepted',
      FRIEND_REQUEST_REJECTED: 'friend_request_rejected',
      FRIEND_REMOVED: 'friend_removed',

      // Block
      BLOCKED: 'blocked',
      UNBLOCKED: 'unblocked',

      // Status
      USER_ONLINE: 'user_online',
      USER_OFFLINE: 'user_offline',

      // Error
      ERROR: 'error',
} as const;
