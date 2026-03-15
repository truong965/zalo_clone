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

      // --- Notification sound settings (Option A: frontend-only) ---
      NOTIF_SOUND_MASTER: 'notif_sound_master',
      NOTIF_SOUND_CALL: 'notif_sound_call',
      NOTIF_SOUND_MESSAGE_DIRECT: 'notif_sound_message_direct',
      NOTIF_SOUND_MESSAGE_GROUP: 'notif_sound_message_group',
      NOTIF_SOUND_SOCIAL: 'notif_sound_social',
      NOTIF_SOUND_VOLUME: 'notif_sound_volume',
      NOTIF_SOUND_LEADER: 'notif_sound_leader',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
