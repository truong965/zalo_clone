/**
 * Reminder Domain Events
 *
 * Event-driven architecture: ReminderModule emits these events,
 * other modules (socket gateway, notification) can listen and react.
 */

/** Emitted by ReminderService after a new reminder is persisted */
export class ReminderCreatedEvent {
  constructor(
    public readonly reminderId: string,
    public readonly userId: string,
    public readonly conversationId: string | null,
    public readonly messageId: bigint | null,
    public readonly content: string,
    public readonly remindAt: Date,
  ) {}
}

/** Emitted by the cron scheduler when remindAt time is reached */
export class ReminderTriggeredEvent {
  constructor(
    public readonly reminderId: string,
    public readonly userId: string,
    public readonly conversationId: string | null,
    public readonly messageId: string | null,
    public readonly content: string,
  ) {}
}

/** Emitted when a reminder is deleted */
export class ReminderDeletedEvent {
  constructor(
    public readonly reminderId: string,
    public readonly userId: string,
  ) {}
}

/** Emitted when a reminder is updated (content, time, or status) */
export class ReminderUpdatedEvent {
  constructor(
    public readonly reminderId: string,
    public readonly userId: string,
    public readonly conversationId: string | null,
    public readonly messageId: bigint | null,
    public readonly content: string,
    public readonly remindAt: Date,
    public readonly isCompleted: boolean,
  ) {}
}
