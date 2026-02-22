/**
 * Centralized route path constants.
 *
 * Sử dụng file này thay vì hardcode route strings ở khắp codebase.
 * Khi đổi tên route, chỉ cần sửa một chỗ duy nhất.
 */

export const ROUTES = {
      // --- Auth ---
      LOGIN: '/login',
      REGISTER: '/register',

      // --- Client app ---
      HOME: '/chat',
      CHAT: '/chat',
      CHAT_CONVERSATION: (id: string) => `/chat/${id}` as const,
      CONTACTS: '/contacts',
      CALLS: '/calls',
      PROFILE: '/profile',
      NOTIFICATIONS: '/notifications',
      SETTINGS: '/settings',

      // --- Admin ---
      ADMIN: '/admin',
      ADMIN_DASHBOARD: '/admin/dashboard',
      ADMIN_USERS: '/admin/users',
      ADMIN_MESSAGES: '/admin/messages',
      ADMIN_CALLS: '/admin/calls',
      ADMIN_REPORTS: '/admin/reports',
      ADMIN_SETTINGS: '/admin/settings',

      // --- Utility ---
      PERMISSION_DENIED: '/permission-denied',
} as const;

export type AppRoute = (typeof ROUTES)[keyof Omit<typeof ROUTES, 'CHAT_CONVERSATION'>];
