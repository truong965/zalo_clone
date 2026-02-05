/**
 * Danh sách tất cả API endpoints từ NestJS Backend
 * Giúp tránh hardcode URL, dễ maintain
 */

export const API_ENDPOINTS = {
  // Auth
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    ME: '/auth/me',
  },

  // Users
  USERS: {
    GET_BY_ID: (id: string) => `/users/${id}`,
    GET_PROFILE: '/users/profile',
    UPDATE_PROFILE: '/users/profile',
    UPLOAD_AVATAR: '/users/avatar',
    SEARCH: '/users/search',
  },

  // Chat - Conversations
  CONVERSATIONS: {
    GET_ALL: '/conversations',
    GET_BY_ID: (id: string) => `/conversations/${id}`,
    CREATE: '/conversations',
    UPDATE: (id: string) => `/conversations/${id}`,
    DELETE: (id: string) => `/conversations/${id}`,
    MARK_AS_READ: (id: string) => `/conversations/${id}/read`,
  },

  // Chat - Messages
  MESSAGES: {
    GET_BY_CONVERSATION: (conversationId: string) => `/messages/conversation/${conversationId}`,
    SEND: '/messages',
    EDIT: (id: string) => `/messages/${id}`,
    DELETE: (id: string) => `/messages/${id}`,
    SEARCH: '/messages/search',
  },

  // Contacts - Friends
  FRIENDS: {
    GET_ALL: '/friends',
    GET_BY_ID: (id: string) => `/friends/${id}`,
    SEND_REQUEST: '/friends/request',
    ACCEPT_REQUEST: (id: string) => `/friends/request/${id}/accept`,
    REJECT_REQUEST: (id: string) => `/friends/request/${id}/reject`,
    REMOVE: (id: string) => `/friends/${id}`,
    GET_REQUESTS: '/friends/requests',
  },

  // Block
  BLOCK: {
    GET_BLOCKED: '/block',
    BLOCK_USER: '/block',
    UNBLOCK_USER: (id: string) => `/block/${id}`,
  },

  // Call
  CALL: {
    INITIATE: '/calls',
    END: (id: string) => `/calls/${id}/end`,
    REJECT: (id: string) => `/calls/${id}/reject`,
    ACCEPT: (id: string) => `/calls/${id}/accept`,
  },

  // Notifications
  NOTIFICATIONS: {
    GET_ALL: '/notifications',
    MARK_AS_READ: (id: string) => `/notifications/${id}/read`,
    MARK_ALL_AS_READ: '/notifications/read-all',
    DELETE: (id: string) => `/notifications/${id}`,
  },

  // Media Upload
  MEDIA: {
    UPLOAD: '/media/upload',
    DELETE: (id: string) => `/media/${id}`,
  },
};
