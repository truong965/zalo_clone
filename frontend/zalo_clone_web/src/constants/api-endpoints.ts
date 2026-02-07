/**
 * Danh sách tất cả API endpoints từ NestJS Backend
 * Giúp tránh hardcode URL, dễ maintain
 */

export const API_ENDPOINTS = {
  // Auth
  AUTH: {
    LOGIN: '/api/v1/auth/login',
    REGISTER: '/api/v1/auth/register',
    LOGOUT: '/api/v1/auth/logout',
    REFRESH: '/api/v1/auth/refresh',
    ME: '/api/v1/auth/me',
    SESSIONS: '/api/v1/auth/sessions',
    REVOKE_SESSION: (deviceId: string) => `/api/v1/auth/sessions/${deviceId}`,
  },

  // Users
  USERS: {
    GET_BY_ID: (id: string) => `/api/v1/users/${id}`,
    GET_PROFILE: '/api/v1/users/profile',
    UPDATE_PROFILE: '/api/v1/users/profile',
    UPLOAD_AVATAR: '/api/v1/users/avatar',
    SEARCH: '/api/v1/users/search',
  },

  // Chat - Conversations
  CONVERSATIONS: {
    GET_ALL: '/api/v1/conversations',
    GET_BY_ID: (id: string) => `/api/v1/conversations/${id}`,
    CREATE: '/api/v1/conversations/direct',
    UPDATE: (id: string) => `/api/v1/conversations/${id}`,
    DELETE: (id: string) => `/api/v1/conversations/${id}`,
    MARK_AS_READ: (id: string) => `/api/v1/conversations/${id}/read`,
  },

  // Chat - Messages
  MESSAGES: {
    GET_ALL: '/api/v1/messages',
    SEND: '/api/v1/messages',
    EDIT: (id: string) => `/api/v1/messages/${id}`,
    DELETE: (id: string) => `/api/v1/messages/${id}`,
    SEARCH: '/api/v1/messages/search',
  },

  // Contacts - Friends
  FRIENDS: {
    GET_ALL: '/api/v1/friends',
    GET_BY_ID: (id: string) => `/api/v1/friends/${id}`,
    SEND_REQUEST: '/api/v1/friends/request',
    ACCEPT_REQUEST: (id: string) => `/api/v1/friends/request/${id}/accept`,
    REJECT_REQUEST: (id: string) => `/api/v1/friends/request/${id}/reject`,
    REMOVE: (id: string) => `/api/v1/friends/${id}`,
    GET_REQUESTS: '/api/v1/friends/requests',
  },

  // Block
  BLOCK: {
    GET_BLOCKED: '/api/v1/block',
    BLOCK_USER: '/api/v1/block',
    UNBLOCK_USER: (id: string) => `/api/v1/block/${id}`,
  },

  // Call
  CALL: {
    INITIATE: '/api/v1/calls',
    END: (id: string) => `/api/v1/calls/${id}/end`,
    REJECT: (id: string) => `/api/v1/calls/${id}/reject`,
    ACCEPT: (id: string) => `/api/v1/calls/${id}/accept`,
  },

  // Notifications
  NOTIFICATIONS: {
    GET_ALL: '/api/v1/notifications',
    MARK_AS_READ: (id: string) => `/api/v1/notifications/${id}/read`,
    MARK_ALL_AS_READ: '/api/v1/notifications/read-all',
    DELETE: (id: string) => `/api/v1/notifications/${id}`,
  },

  // Media Upload
  MEDIA: {
    UPLOAD: '/api/v1/media/upload',
    DELETE: (id: string) => `/api/v1/media/${id}`,
  },
};
