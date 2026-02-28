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
    GET_MEMBERS: (id: string) => `/api/v1/conversations/${id}/members`,
    GROUPS: '/api/v1/conversations/groups',
    PIN: (id: string) => `/api/v1/conversations/${id}/pin`,
    PINNED_MESSAGES: (id: string) => `/api/v1/conversations/${id}/pinned-messages`,
    PIN_MESSAGE: (id: string) => `/api/v1/conversations/${id}/pin-message`,
    MUTE: (id: string) => `/api/v1/conversations/${id}/mute`,
    ARCHIVE: (id: string) => `/api/v1/conversations/${id}/archive`,
  },

  // Chat - Messages
  MESSAGES: {
    GET_ALL: '/api/v1/messages',
    SEND: '/api/v1/messages',
    EDIT: (id: string) => `/api/v1/messages/${id}`,
    DELETE: (id: string) => `/api/v1/messages/${id}`,
    SEARCH: '/api/v1/messages/search',
    CONTEXT: '/api/v1/messages/context',
    RECENT_MEDIA: (conversationId: string) =>
      `/api/v1/messages/conversations/${conversationId}/media/recent`,
  },

  // Contacts - Friendships (/friendships controller)
  FRIENDS: {
    GET_ALL: '/api/v1/friendships',
    UNFRIEND: (targetUserId: string) => `/api/v1/friendships/${targetUserId}`,
    MUTUAL: (targetUserId: string) => `/api/v1/friendships/mutual/${targetUserId}`,
    CHECK_STATUS: (targetUserId: string) => `/api/v1/friendships/check/${targetUserId}`,
    COUNT: '/api/v1/friendships/count',
    // Friend requests (/friend-requests controller)
    SEND_REQUEST: '/api/v1/friend-requests',
    GET_RECEIVED: '/api/v1/friend-requests/received',
    GET_SENT: '/api/v1/friend-requests/sent',
    ACCEPT_REQUEST: (id: string) => `/api/v1/friend-requests/${id}/accept`,
    DECLINE_REQUEST: (id: string) => `/api/v1/friend-requests/${id}/decline`,
    CANCEL_REQUEST: (id: string) => `/api/v1/friend-requests/${id}`,
  },

  // Block
  BLOCK: {
    BLOCK_USER: '/api/v1/block/block',
    UNBLOCK_USER: (targetUserId: string) => `/api/v1/block/block/${targetUserId}`,
    GET_BLOCKED_LIST: '/api/v1/block/blocked',
  },

  // Call
  CALL: {
    INITIATE: '/api/v1/calls',
    END: (id: string) => `/api/v1/calls/${id}/end`,
    REJECT: (id: string) => `/api/v1/calls/${id}/reject`,
    ACCEPT: (id: string) => `/api/v1/calls/${id}/accept`,
    HISTORY: '/api/v1/calls/history',
    MISSED_COUNT: '/api/v1/calls/missed',
    MARK_MISSED_VIEWED: '/api/v1/calls/missed/view-all',
    DELETE: (id: string) => `/api/v1/calls/history/${id}`,
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
    INITIATE: '/api/v1/media/upload/initiate',
    CONFIRM: '/api/v1/media/upload/confirm',
    GET: (id: string) => `/api/v1/media/${id}`,
    DELETE: (id: string) => `/api/v1/media/${id}`,
  },

  // Search Analytics
  SEARCH: {
    CONTACTS: '/api/v1/search/contacts',
    HISTORY: '/api/v1/search/analytics/history',
    SUGGESTIONS: '/api/v1/search/analytics/suggestions',
    TRENDING: '/api/v1/search/analytics/trending',
    TRACK_CLICK: '/api/v1/search/analytics/track-click',
  },

  // Privacy Settings
  PRIVACY: {
    GET: '/api/v1/privacy',
    UPDATE: '/api/v1/privacy',
  },

  // Contacts (phone book contacts — separate from friendships)
  CONTACTS: {
    GET_ALL: '/api/v1/contacts',
    SYNC: '/api/v1/contacts/sync',
    REMOVE: (contactUserId: string) => `/api/v1/contacts/${contactUserId}`,
    CHECK: (targetUserId: string) => `/api/v1/contacts/check/${targetUserId}`,
    UPDATE_ALIAS: (contactUserId: string) => `/api/v1/contacts/${contactUserId}/alias`,
  },

  // Devices (FCM push token management)
  DEVICES: {
    REGISTER: '/api/v1/devices',
    REMOVE: (deviceId: string) => `/api/v1/devices/${deviceId}`,
  },

  // Reminders
  REMINDERS: {
    BASE: '/api/v1/reminders',
    BY_ID: (id: string) => `/api/v1/reminders/${id}`,
    UNDELIVERED: '/api/v1/reminders/undelivered',
    BY_CONVERSATION: (conversationId: string) => `/api/v1/reminders/conversation/${conversationId}`,
  },

  // Admin Panel
  ADMIN: {
    STATS: {
      OVERVIEW: '/api/v1/admin/stats/overview',
      DAILY: '/api/v1/admin/stats/daily',
    },
    USERS: {
      LIST: '/api/v1/admin/users',
      DETAIL: (id: string) => `/api/v1/admin/users/${id}`,
      SUSPEND: (id: string) => `/api/v1/admin/users/${id}/suspend`,
      ACTIVATE: (id: string) => `/api/v1/admin/users/${id}/activate`,
      FORCE_LOGOUT: (id: string) => `/api/v1/admin/users/${id}/force-logout`,
    },
    CONVERSATIONS: '/api/v1/admin/conversations',
    CALLS: '/api/v1/admin/calls',
    ACTIVITY: {
      SUSPENDED: '/api/v1/admin/activity/suspended',
      INACTIVE: '/api/v1/admin/activity/inactive',
      HIGH_ACTIVITY: '/api/v1/admin/activity/high-activity',
      MULTI_DEVICE: '/api/v1/admin/activity/multi-device',
    },
    SYSTEM: {
      STATUS: '/api/v1/admin/system/status',
    },
    ROLES: {
      LIST: '/api/v1/roles',
      DETAIL: (id: string) => `/api/v1/roles/${id}`,
      CREATE: '/api/v1/roles',
      UPDATE: (id: string) => `/api/v1/roles/${id}`,
      DELETE: (id: string) => `/api/v1/roles/${id}`,
    },
  },
};
