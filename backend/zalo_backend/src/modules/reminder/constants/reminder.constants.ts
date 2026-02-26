/**
 * Reminder Module Constants
 *
 * Centralized business rule constants to avoid magic numbers.
 */

/** Maximum number of active (non-completed) reminders per user */
export const MAX_ACTIVE_REMINDERS = 50;

/** Minimum time in the future for a reminder (ms) — 1 minute */
export const MIN_REMINDER_DELAY_MS = 60_000;

/** Maximum time in the future for a reminder — 1 year */
export const MAX_REMINDER_DELAY_MS = 365 * 24 * 60 * 60 * 1000;

/** Maximum content length */
export const MAX_REMINDER_CONTENT_LENGTH = 500;
