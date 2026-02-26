/**
 * Centralized localStorage / sessionStorage key constants.
 *
 * Sử dụng file này thay vì hardcode string keys rải rác trong codebase.
 * Khi đổi tên key, chỉ cần sửa một chỗ duy nhất.
 */

export const STORAGE_KEYS = {
      // --- Auth tokens (localStorage) ---
      ACCESS_TOKEN: 'accessToken',
      EXPIRES_IN: 'expiresIn',

      // --- Zustand persist keys (localStorage) ---
      AUTH_STORE: 'auth-store',

      // --- UI preferences (localStorage) ---
      THEME: 'theme',
      LANGUAGE: 'language',

      // --- Chat session (sessionStorage) ---
      CHAT_SELECTED_ID: 'chat_selectedId',

      // --- Push Notifications (localStorage) ---
      FCM_TOKEN: 'fcm_token',
      DEVICE_ID: 'device_id',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
