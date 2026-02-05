/**
 * Types cho Notification module
 */

import type { Notification } from '@/types';

export type { Notification };

export interface NotificationState {
      notifications: Notification[];
      unreadCount: number;
      isLoading: boolean;
      error: string | null;
}
