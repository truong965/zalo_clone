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

// ── Push Notification Types ──

export interface PushNotificationData {
      type: 'INCOMING_CALL' | 'MISSED_CALL' | 'GENERIC';
      callId?: string;
      callerId?: string;
      callerName?: string;
      callerAvatar?: string;
      callType?: 'AUDIO' | 'VIDEO';
      title?: string;
      body?: string;
      url?: string;
}

export interface DeviceTokenRegistration {
      deviceId: string;
      fcmToken: string;
      platform: 'WEB' | 'ANDROID' | 'IOS';
}
