/**
 * Reminder Domain Events
 *
 * Event-driven architecture: ReminderModule emits these events,
 * other modules (socket gateway, notification) can listen and react.
 */

/** Emitted by ReminderService after a new reminder is persisted */
export class ReminderCreatedEvent {
      static readonly eventName = 'reminder.created';

      constructor(
            public readonly reminderId: string,
            public readonly userId: string,
            public readonly conversationId: string | null,
            public readonly messageId: bigint | null,
            public readonly content: string,
            public readonly remindAt: Date,
      ) { }
}

/** Emitted by the cron scheduler when remindAt time is reached */
export class ReminderTriggeredEvent {
      static readonly eventName = 'reminder.triggered';

      constructor(
            public readonly reminderId: string,
            public readonly userId: string,
            public readonly conversationId: string | null,
            public readonly messageId: string | null,
            public readonly content: string,
      ) { }
}

/** Emitted when a reminder is updated (rescheduled) */
export class ReminderUpdatedEvent {
      static readonly eventName = 'reminder.updated';

      constructor(
            public readonly reminderId: string,
            public readonly userId: string,
            public readonly newRemindAt: Date,
      ) { }
}

/** Emitted when a reminder is deleted */
export class ReminderDeletedEvent {
      static readonly eventName = 'reminder.deleted';

      constructor(
            public readonly reminderId: string,
            public readonly userId: string,
      ) { }
}
