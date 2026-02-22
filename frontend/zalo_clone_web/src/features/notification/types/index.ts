/**
 * Types cho Notification module
 */

export interface Notification {
      id: string;
      userId: string;
      type: string;
      title: string;
      body: string;
      isRead: boolean;
      data?: Record<string, unknown>;
      createdAt: string;
}

export interface NotificationState {
      notifications: Notification[];
      unreadCount: number;
      isLoading: boolean;
      error: string | null;
}
