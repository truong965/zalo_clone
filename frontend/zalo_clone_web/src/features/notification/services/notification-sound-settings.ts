import { STORAGE_KEYS } from '@/constants/storage-keys';

export type NotificationSoundVolume = 'low' | 'medium' | 'high';

export interface NotificationSoundSettings {
      master: boolean;
      incomingCall: boolean;
      messageDirect: boolean;
      messageGroup: boolean;
      social: boolean;
      volume: NotificationSoundVolume;
}

export const DEFAULT_NOTIFICATION_SOUND_SETTINGS: NotificationSoundSettings = {
      master: true,
      incomingCall: true,
      messageDirect: true,
      messageGroup: false,
      social: false,
      volume: 'medium',
};

function getBool(key: string, fallback: boolean): boolean {
      try {
            const raw = localStorage.getItem(key);
            if (raw === null) return fallback;
            return raw === 'true';
      } catch {
            return fallback;
      }
}

function getVolume(): NotificationSoundVolume {
      try {
            const raw = localStorage.getItem(STORAGE_KEYS.NOTIF_SOUND_VOLUME);
            if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
            return DEFAULT_NOTIFICATION_SOUND_SETTINGS.volume;
      } catch {
            return DEFAULT_NOTIFICATION_SOUND_SETTINGS.volume;
      }
}

export function readNotificationSoundSettings(): NotificationSoundSettings {
      return {
            master: getBool(STORAGE_KEYS.NOTIF_SOUND_MASTER, DEFAULT_NOTIFICATION_SOUND_SETTINGS.master),
            incomingCall: getBool(STORAGE_KEYS.NOTIF_SOUND_CALL, DEFAULT_NOTIFICATION_SOUND_SETTINGS.incomingCall),
            messageDirect: getBool(
                  STORAGE_KEYS.NOTIF_SOUND_MESSAGE_DIRECT,
                  DEFAULT_NOTIFICATION_SOUND_SETTINGS.messageDirect,
            ),
            messageGroup: getBool(
                  STORAGE_KEYS.NOTIF_SOUND_MESSAGE_GROUP,
                  DEFAULT_NOTIFICATION_SOUND_SETTINGS.messageGroup,
            ),
            social: getBool(STORAGE_KEYS.NOTIF_SOUND_SOCIAL, DEFAULT_NOTIFICATION_SOUND_SETTINGS.social),
            volume: getVolume(),
      };
}

export function ensureNotificationSoundDefaults(): void {
      try {
            const defaults: Array<[string, string]> = [
                  [STORAGE_KEYS.NOTIF_SOUND_MASTER, String(DEFAULT_NOTIFICATION_SOUND_SETTINGS.master)],
                  [STORAGE_KEYS.NOTIF_SOUND_CALL, String(DEFAULT_NOTIFICATION_SOUND_SETTINGS.incomingCall)],
                  [
                        STORAGE_KEYS.NOTIF_SOUND_MESSAGE_DIRECT,
                        String(DEFAULT_NOTIFICATION_SOUND_SETTINGS.messageDirect),
                  ],
                  [
                        STORAGE_KEYS.NOTIF_SOUND_MESSAGE_GROUP,
                        String(DEFAULT_NOTIFICATION_SOUND_SETTINGS.messageGroup),
                  ],
                  [STORAGE_KEYS.NOTIF_SOUND_SOCIAL, String(DEFAULT_NOTIFICATION_SOUND_SETTINGS.social)],
                  [STORAGE_KEYS.NOTIF_SOUND_VOLUME, DEFAULT_NOTIFICATION_SOUND_SETTINGS.volume],
            ];

            for (const [key, value] of defaults) {
                  if (localStorage.getItem(key) === null) {
                        localStorage.setItem(key, value);
                  }
            }
      } catch {
            // ignore storage write errors
      }
}

/**
 * Map from logical setting field → localStorage key.
 */
const SETTING_KEY_MAP: Record<keyof NotificationSoundSettings, string> = {
      master: STORAGE_KEYS.NOTIF_SOUND_MASTER,
      incomingCall: STORAGE_KEYS.NOTIF_SOUND_CALL,
      messageDirect: STORAGE_KEYS.NOTIF_SOUND_MESSAGE_DIRECT,
      messageGroup: STORAGE_KEYS.NOTIF_SOUND_MESSAGE_GROUP,
      social: STORAGE_KEYS.NOTIF_SOUND_SOCIAL,
      volume: STORAGE_KEYS.NOTIF_SOUND_VOLUME,
};

/**
 * Write a single notification sound setting to localStorage.
 * Used by the settings UI to persist changes immediately.
 */
export function writeNotificationSoundSetting<K extends keyof NotificationSoundSettings>(
      field: K,
      value: NotificationSoundSettings[K],
): void {
      try {
            localStorage.setItem(SETTING_KEY_MAP[field], String(value));
      } catch {
            // ignore storage write errors
      }
}
