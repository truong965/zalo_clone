/**
 * Reminder Module Types
 */

export interface ReminderItem {
  id: string;
  userId: string;
  conversationId: string | null;
  messageId: string | null;
  content: string;
  remindAt: string;
  isTriggered: boolean;
  triggeredAt: string | null;
  isCompleted: boolean;
  createdAt: string;
  completedAt: string | null;
  conversation?: {
    id: string;
    name: string | null;
    type: string;
  } | null;
  message?: {
    id: string;
    content: string | null;
    type: string;
  } | null;
}

export interface ReminderTriggeredPayload {
  reminderId: string;
  conversationId: string | null;
  messageId: string | null;
  content: string;
  /** ID of the user who created the reminder */
  creatorId: string;
}

export interface CreateReminderParams {
  content: string;
  remindAt: string;
  conversationId?: string;
  messageId?: string;
}

export interface UpdateReminderParams {
  content?: string;
  remindAt?: string;
  isCompleted?: boolean;
}
