/**
 * Reminder Module Types
 *
 * User-scoped reminders linked to conversations/messages.
 */

// ============================================================================
// ENTITIES
// ============================================================================

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
      /** ID of the user who created the reminder (may differ from the recipient for group reminders) */
      creatorId: string;
}

// ============================================================================
// DTOs
// ============================================================================

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
