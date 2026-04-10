import { OUTBOUND_SOCKET_EVENT } from '@common/events/outbound-socket.event';

/**
 * Stage 7.1 internal event registry (typed names only).
 *
 * Scope of this stage:
 * - Start with high-priority transport/internal events.
 * - Keep runtime behavior unchanged.
 * - Provide a single source for event-name typing in upcoming refactors.
 */
export const InternalEventNames = {
  // Transport / realtime
  OUTBOUND_SOCKET: OUTBOUND_SOCKET_EVENT,
  USER_SOCKET_CONNECTED: 'user.socket.connected',
  USER_SOCKET_DISCONNECTED: 'user.socket.disconnected',
  USER_LAST_SEEN_UPDATED: 'user.last_seen.updated',
  SEARCH_INTERNAL_NEW_MATCH: 'search.internal.newMatch',
  SEARCH_INTERNAL_RESULT_REMOVED: 'search.internal.resultRemoved',
  SOCKET_INTERNAL_FORCE_DISCONNECT_DEVICES:
    'socket.internal.command.force_disconnect_devices',

  // Identity / auth
  USER_REGISTERED: 'user.registered',
  USER_PROFILE_UPDATED: 'user.profile.updated',
  USER_EMAIL_UPDATED: 'user.email.updated',
  USER_LOGGED_OUT: 'user.logged_out',
  AUTH_SECURITY_REVOKED: 'auth.security.revoked',

  // Friendship
  FRIENDSHIP_REQUEST_SENT: 'friendship.request.sent',
  FRIENDSHIP_ACCEPTED: 'friendship.accepted',
  FRIENDSHIP_REQUEST_DECLINED: 'friendship.request.declined',
  FRIENDSHIP_REQUEST_CANCELLED: 'friendship.request.cancelled',
  FRIENDSHIP_UNFRIENDED: 'friendship.unfriended',

  // Block / privacy
  USER_BLOCKED: 'user.blocked',
  USER_UNBLOCKED: 'user.unblocked',
  PRIVACY_UPDATED: 'privacy.updated',
  CACHE_INVALIDATE: 'cache.invalidate',

  // Contacts
  CONTACT_ALIAS_UPDATED: 'contact.alias.updated',
  CONTACT_REMOVED: 'contact.removed',
  CONTACTS_SYNCED: 'contacts.synced',

  // Messaging
  MESSAGE_SENT: 'message.sent',
  MESSAGE_DELETED: 'message.deleted',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_EDITED: 'message.edited',

  // Conversation
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_MEMBER_ADDED: 'conversation.member.added',
  CONVERSATION_MEMBER_LEFT: 'conversation.member.left',
  CONVERSATION_MEMBER_PROMOTED: 'conversation.member.promoted',
  CONVERSATION_MEMBER_DEMOTED: 'conversation.member.demoted',
  CONVERSATION_DISSOLVED: 'conversation.dissolved',
  CONVERSATION_PINNED: 'conversation.pinned',
  CONVERSATION_UNPINNED: 'conversation.unpinned',
  CONVERSATION_MUTED: 'conversation.muted',
  CONVERSATION_ARCHIVED: 'conversation.archived',
  CONVERSATION_UPDATED: 'conversation.updated',

  // Calls
  CALL_ENDED: 'call.ended',
  CALL_PUSH_NOTIFICATION_NEEDED: 'call.push_notification_needed',
  CALL_PUSH_NOTIFICATION_CANCELLED: 'call.push_notification_cancelled',

  // Media
  MEDIA_UPLOAD_INITIATED: 'media.upload_initiated',
  MEDIA_AVATAR_UPLOAD_INITIATED: 'media.avatar_upload_initiated',
  MEDIA_UPLOADED: 'media.uploaded',
  MEDIA_PROCESSED: 'media.processed',
  MEDIA_FAILED: 'media.failed',
  MEDIA_DELETED: 'media.deleted',

  // Reminder
  REMINDER_CREATED: 'reminder.created',
  REMINDER_TRIGGERED: 'reminder.triggered',
  REMINDER_DELETED: 'reminder.deleted',
  REMINDER_UPDATED: 'reminder.updated',

  // AI unified response contract (Phase 0 scaffold)
  AI_RESPONSE_STARTED: 'ai.response.started',
  AI_RESPONSE_PROGRESS: 'ai.response.progress',
  AI_RESPONSE_DELTA: 'ai.response.delta',
  AI_RESPONSE_COMPLETED: 'ai.response.completed',
  AI_RESPONSE_ERROR: 'ai.response.error',
} as const;

export type InternalEventName =
  (typeof InternalEventNames)[keyof typeof InternalEventNames];
