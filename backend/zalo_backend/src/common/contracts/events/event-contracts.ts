import type { ISocketEmitEvent } from '@common/events/outbound-socket.event';
import type { AuthenticatedSocket } from '@common/interfaces/socket-client.interface';
import type { MessageWithSearchContext } from '@modules/search_engine/interfaces/search-raw-result.interface';
import { InternalEventNames } from './event-names';

export interface DomainEventEnvelope {
  eventId?: string;
  correlationId?: string;
  occurredAt?: Date;
  [key: string]: unknown;
}

/**
 * Runtime payload shape emitted by SocketGateway.
 *
 * Note:
 * - socketId can be null for cross-server presence relays.
 * - socket is optional and only available for same-process connect flow.
 */
export interface UserSocketConnectedEventPayload {
  userId: string;
  socketId: string | null;
  connectedAt: Date;
  socket?: AuthenticatedSocket;
}

/**
 * Runtime payload shape emitted by SocketGateway.
 *
 * Note:
 * - socketId can be null for cross-server presence relays.
 */
export interface UserSocketDisconnectedEventPayload {
  userId: string;
  socketId: string | null;
  reason: string;
}

export interface UserLastSeenUpdatedEventPayload {
  userId: string;
  lastSeenAt: Date;
}

/**
 * Internal batched match payload emitted by RealTimeSearchService
 * and consumed by SearchGateway.
 */
export interface SearchInternalNewMatchEventPayload {
  message: MessageWithSearchContext;
  subscriptions: Array<{
    socketId: string;
    keyword: string;
    userId: string;
  }>;
}

/**
 * Internal removal payload emitted by SearchEventListener
 * and consumed by SearchGateway.
 */
export interface SearchInternalResultRemovedEventPayload {
  messageId: string;
  conversationId: string;
}

export interface UserRegisteredEventPayload extends DomainEventEnvelope {
  userId: string;
}

export interface UserProfileUpdatedEventPayload extends DomainEventEnvelope {
  userId: string;
}

export interface UserEmailUpdatedEventPayload extends DomainEventEnvelope {
  userId: string;
  newEmail: string;
}

export interface UserLoggedOutEventPayload {
  userId: string;
  deviceId: string;
  timestamp: Date;
}

export interface AuthSecurityRevokedEventPayload {
  userId: string;
  deviceIds: string[];
  reason?: string;
}

export interface SocketForceDisconnectDevicesCommandPayload {
  userId: string;
  deviceIds: string[];
  reason: string;
}

export interface FriendshipEventPayload extends DomainEventEnvelope {
  requesterId: string;
  addresseeId: string;
}

export interface FriendshipRequestSentPayload extends DomainEventEnvelope {
  eventId: string;
  eventType: 'FRIEND_REQUEST_SENT';
  requestId: string;
  fromUserId: string;
  toUserId: string;
  version: number;
  timestamp: Date;
  source: string;
  aggregateId: string;
}

export interface FriendshipAcceptedPayload extends DomainEventEnvelope {
  eventId: string;
  eventType: 'FRIEND_REQUEST_ACCEPTED';
  friendshipId: string;
  acceptedBy: string;
  requesterId: string;
  user1Id: string;
  user2Id: string;
  version: number;
  timestamp: Date;
  source: string;
  aggregateId: string;
}

export interface FriendshipRejectedPayload extends DomainEventEnvelope {
  eventId: string;
  eventType: 'FRIEND_REQUEST_REJECTED';
  requestId: string;
  fromUserId: string;
  toUserId: string;
  version: number;
  timestamp: Date;
  source: string;
  aggregateId: string;
}

export interface FriendshipCancelledPayload extends DomainEventEnvelope {
  eventId: string;
  eventType: 'FRIEND_REQUEST_CANCELLED';
  friendshipId: string;
  cancelledBy: string;
  targetUserId: string;
  version: number;
  timestamp: Date;
  source: string;
  aggregateId: string;
}

export interface UnfriendedPayload extends DomainEventEnvelope {
  eventId: string;
  eventType: 'UNFRIENDED';
  friendshipId: string;
  initiatedBy: string;
  user1Id: string;
  user2Id: string;
  version: number;
  timestamp: Date;
  source: string;
  aggregateId: string;
}

export interface UserPairEventPayload extends DomainEventEnvelope {
  userId1: string;
  userId2: string;
}

export interface UserBlockedEventPayload extends DomainEventEnvelope {
  eventId: string;
  eventType: 'USER_BLOCKED';
  blockerId: string;
  blockedId: string;
  blockId: string;
  reason?: string;
  version: number;
  timestamp: Date;
  source: string;
  aggregateId: string;
}

export interface UserUnblockedEventPayload extends DomainEventEnvelope {
  eventId: string;
  eventType: 'USER_UNBLOCKED';
  blockerId: string;
  blockedId: string;
  blockId: string;
  version: number;
  timestamp: Date;
  source: string;
  aggregateId: string;
}

export interface PrivacyUpdatedEventPayload extends DomainEventEnvelope {
  userId: string;
  changes?: Record<string, unknown>;
}

export interface PrivacySettingsUpdatedPayload extends DomainEventEnvelope {
  eventId: string;
  eventType: 'PRIVACY_SETTINGS_UPDATED';
  userId: string;
  settings: Record<string, unknown>;
  version: number;
  timestamp: Date;
  source: string;
  aggregateId: string;
}

export interface CacheInvalidateEventPayload {
  keys?: string[];
  patterns?: string[];
}

export interface ContactAliasUpdatedEventPayload extends DomainEventEnvelope {
  ownerId: string;
  contactUserId: string;
}

export interface ContactRemovedEventPayload extends DomainEventEnvelope {
  ownerId: string;
  contactUserId: string;
}

export interface ContactsSyncedEventPayload extends DomainEventEnvelope {
  ownerId: string;
  syncedCount?: number;
}

export interface MessageSentEventPayload extends DomainEventEnvelope {
  messageId: string;
  conversationId: string;
  senderId: string;
}

export interface MessageDeletedEventPayload extends DomainEventEnvelope {
  messageId: string;
  conversationId: string;
  deletedById: string;
}

export interface MessageUpdatedEventPayload extends DomainEventEnvelope {
  messageId: string;
  conversationId: string;
  updatedById: string;
}

export interface ConversationEventPayload extends DomainEventEnvelope {
  conversationId: string;
  actorId?: string;
}

export interface ConversationMemberEventPayload extends ConversationEventPayload {
  memberUserId: string;
}

export interface CallEndedEventPayload extends DomainEventEnvelope {
  callId: string;
  conversationId?: string;
}

export interface CallPushNotificationNeededEventPayload {
  callId: string;
  callerId: string;
  calleeId: string;
}

export interface CallPushNotificationCancelledEventPayload {
  callId: string;
  userId: string;
}

export interface MediaEventPayload {
  mediaId: string;
  ownerId?: string;
}

export interface MediaAvatarUploadInitiatedPayload extends DomainEventEnvelope {
  targetId: string;
  targetType: 'USER' | 'GROUP';
  avatarUrl: string;
}

export interface ReminderCreatedEventPayload {
  reminderId: string;
  userId: string;
  conversationId?: string | null;
  messageId?: bigint | null;
  content: string;
  remindAt: Date;
}

export interface ReminderTriggeredEventPayload {
  reminderId: string;
  userId: string;
  conversationId?: string | null;
  messageId?: string | null;
  content: string;
}

export interface ReminderDeletedEventPayload {
  reminderId: string;
  userId: string;
}

/**
 * Stage 7.1 typed payload map for high-priority internal events.
 *
 * This map is intentionally scoped to the first event subset in the plan.
 * Additional domain events will be expanded in later sub-stages.
 */
export interface InternalEventPayloadMap {
  [InternalEventNames.OUTBOUND_SOCKET]: ISocketEmitEvent;
  [InternalEventNames.USER_SOCKET_CONNECTED]: UserSocketConnectedEventPayload;
  [InternalEventNames.USER_SOCKET_DISCONNECTED]: UserSocketDisconnectedEventPayload;
  [InternalEventNames.USER_LAST_SEEN_UPDATED]: UserLastSeenUpdatedEventPayload;
  [InternalEventNames.SEARCH_INTERNAL_NEW_MATCH]: SearchInternalNewMatchEventPayload;
  [InternalEventNames.SEARCH_INTERNAL_RESULT_REMOVED]: SearchInternalResultRemovedEventPayload;
  [InternalEventNames.SOCKET_INTERNAL_FORCE_DISCONNECT_DEVICES]: SocketForceDisconnectDevicesCommandPayload;

  [InternalEventNames.USER_REGISTERED]: UserRegisteredEventPayload;
  [InternalEventNames.USER_PROFILE_UPDATED]: UserProfileUpdatedEventPayload;
  [InternalEventNames.USER_LOGGED_OUT]: UserLoggedOutEventPayload;
  [InternalEventNames.AUTH_SECURITY_REVOKED]: AuthSecurityRevokedEventPayload;

  [InternalEventNames.FRIENDSHIP_REQUEST_SENT]: FriendshipRequestSentPayload;
  [InternalEventNames.FRIENDSHIP_ACCEPTED]: FriendshipAcceptedPayload;
  [InternalEventNames.FRIENDSHIP_REQUEST_DECLINED]: FriendshipRejectedPayload;
  [InternalEventNames.FRIENDSHIP_REQUEST_CANCELLED]: FriendshipCancelledPayload;
  [InternalEventNames.FRIENDSHIP_UNFRIENDED]: UnfriendedPayload;

  [InternalEventNames.USER_BLOCKED]: UserBlockedEventPayload;
  [InternalEventNames.USER_UNBLOCKED]: UserUnblockedEventPayload;
  [InternalEventNames.PRIVACY_UPDATED]: PrivacySettingsUpdatedPayload;
  [InternalEventNames.CACHE_INVALIDATE]: CacheInvalidateEventPayload;

  [InternalEventNames.CONTACT_ALIAS_UPDATED]: ContactAliasUpdatedEventPayload;
  [InternalEventNames.CONTACT_REMOVED]: ContactRemovedEventPayload;
  [InternalEventNames.CONTACTS_SYNCED]: ContactsSyncedEventPayload;

  [InternalEventNames.MESSAGE_SENT]: MessageSentEventPayload;
  [InternalEventNames.MESSAGE_DELETED]: MessageDeletedEventPayload;
  [InternalEventNames.MESSAGE_UPDATED]: MessageUpdatedEventPayload;
  [InternalEventNames.MESSAGE_EDITED]: MessageUpdatedEventPayload;

  [InternalEventNames.CONVERSATION_CREATED]: ConversationEventPayload;
  [InternalEventNames.CONVERSATION_MEMBER_ADDED]: ConversationMemberEventPayload;
  [InternalEventNames.CONVERSATION_MEMBER_LEFT]: ConversationMemberEventPayload;
  [InternalEventNames.CONVERSATION_MEMBER_PROMOTED]: ConversationMemberEventPayload;
  [InternalEventNames.CONVERSATION_MEMBER_DEMOTED]: ConversationMemberEventPayload;
  [InternalEventNames.CONVERSATION_DISSOLVED]: ConversationEventPayload;
  [InternalEventNames.CONVERSATION_MUTED]: ConversationEventPayload;
  [InternalEventNames.CONVERSATION_ARCHIVED]: ConversationEventPayload;
  [InternalEventNames.CONVERSATION_UPDATED]: ConversationEventPayload;

  [InternalEventNames.CALL_ENDED]: CallEndedEventPayload;
  [InternalEventNames.CALL_PUSH_NOTIFICATION_NEEDED]: CallPushNotificationNeededEventPayload;
  [InternalEventNames.CALL_PUSH_NOTIFICATION_CANCELLED]: CallPushNotificationCancelledEventPayload;

  [InternalEventNames.MEDIA_UPLOAD_INITIATED]: MediaEventPayload; // Added if needed
  [InternalEventNames.MEDIA_AVATAR_UPLOAD_INITIATED]: MediaAvatarUploadInitiatedPayload;
  [InternalEventNames.MEDIA_UPLOADED]: MediaEventPayload;
  [InternalEventNames.MEDIA_PROCESSED]: MediaEventPayload;
  [InternalEventNames.MEDIA_FAILED]: MediaEventPayload;
  [InternalEventNames.MEDIA_DELETED]: MediaEventPayload;

  [InternalEventNames.REMINDER_CREATED]: ReminderCreatedEventPayload;
  [InternalEventNames.REMINDER_TRIGGERED]: ReminderTriggeredEventPayload;
  [InternalEventNames.REMINDER_DELETED]: ReminderDeletedEventPayload;
}

export type InternalEventPayload<
  TEventName extends keyof InternalEventPayloadMap,
> = InternalEventPayloadMap[TEventName];

export type InternalEventPayloadByName = {
  [K in keyof InternalEventPayloadMap]: {
    eventName: K;
    payload: InternalEventPayloadMap[K];
  };
}[keyof InternalEventPayloadMap];
