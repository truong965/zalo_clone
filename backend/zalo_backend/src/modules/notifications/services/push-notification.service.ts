/**
 * PushNotificationService — high-level push notification orchestrator.
 *
 * Combines DeviceTokenService (token lookup) and FirebaseService (FCM delivery)
 * to provide domain-specific push methods (incoming call, missed call, etc.).
 *
 * Business rules:
 * - Incoming call → HIGH priority, data-only (client renders full-screen UI)
 * - Missed call → NORMAL priority, notification payload (system tray)
 * - Automatically prunes invalid tokens after each send
 */

import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { DeviceTokenService } from './device-token.service';

export interface LoginApprovalPushParams {
  userId: string;
  deviceName: string;
  location?: string;
  ipAddress?: string;
  pendingToken: string;
}

export interface IncomingCallPushParams {
  callId: string;
  callType: 'VOICE' | 'VIDEO';
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  calleeId: string;
  conversationId?: string;
  /** Group call flag — drives group-aware push content */
  isGroupCall?: boolean;
  /** Group conversation name */
  groupName?: string | null;
}

export interface MissedCallPushParams {
  callId: string;
  callType: 'VOICE' | 'VIDEO';
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  calleeId: string;
  /** Group call flag — drives group-aware push content */
  isGroupCall?: boolean;
  /** Group conversation name (resolved by listener) */
  conversationName?: string | null;
}

/**
 * Params for friendship push notifications.
 * Built by FriendshipNotificationListener from domain events.
 */
export interface FriendRequestPushParams {
  recipientId: string;
  fromUserId: string;
  fromUserName: string;
  fromUserAvatar: string | null;
  requestId: string;
}

export interface FriendAcceptedPushParams {
  recipientId: string;
  acceptedByUserId: string;
  acceptedByName: string;
  acceptedByAvatar: string | null;
  friendshipId: string;
}

/**
 * Params for group event push notifications.
 * Built by GroupNotificationListener from domain events.
 */
export interface GroupEventPushParams {
  recipientId: string;
  conversationId: string;
  /** Subtype for frontend routing/display differentiation */
  subtype: string;
  groupName: string;
  title: string;
  body: string;
}

/**
 * Params for reminder push notifications.
 * Built by ReminderNotificationListener from domain events.
 */
export interface ReminderPushParams {
  recipientId: string;
  reminderId: string;
  content: string;
  conversationId: string | null;
  creatorId: string;
  title: string;
  body: string;
}

/**
 * Params for message push notifications (single or batched).
 * Built by MessageNotificationListener from BatchState.
 */
export interface MessagePushParams {
  recipientId: string;
  conversationId: string;
  conversationType: 'DIRECT' | 'GROUP';
  senderName: string;
  /** Last message content (truncated, type-aware) */
  messageContent: string;
  /** Number of messages in this batch */
  messageCount: number;
  /** Group/conversation name (for group chats) */
  conversationName: string | null;
  senderId: string;
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly deviceTokens: DeviceTokenService,
  ) {}

  /** Whether push notifications are available (Firebase initialised + credentials present). */
  get isAvailable(): boolean {
    return this.firebase.isAvailable;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Incoming call (HIGH priority, data-only → client renders call UI)
  // ─────────────────────────────────────────────────────────────────────

  async sendIncomingCallPush(params: IncomingCallPushParams): Promise<void> {
    const {
      callId,
      callType,
      callerId,
      callerName,
      callerAvatar,
      calleeId,
      conversationId,
      isGroupCall,
      groupName,
    } = params;

    const tokens = await this.deviceTokens.getTokensByUserId(calleeId);
    if (tokens.length === 0) {
      this.logger.debug(
        `No FCM tokens for callee ${calleeId.slice(0, 8)}… — skip incoming call push`,
      );
      return;
    }

    // Data-only message: client-side rendering for full-screen call UI
    // Do NOT use `notification` key — allows client to handle display
    const data: Record<string, string> = {
      type: 'INCOMING_CALL',
      callId,
      callType,
      callerId,
      callerName,
      callerAvatar: callerAvatar ?? '',
      conversationId: conversationId ?? '',
      isGroupCall: isGroupCall ? 'true' : 'false',
      groupName: groupName ?? '',
      timestamp: new Date().toISOString(),
    };

    const { invalidTokens } = await this.firebase.sendMulticast(tokens, data, {
      priority: 'high',
      ttlSeconds: 30, // Expire quickly — caller may cancel
    });

    await this.deviceTokens.cleanupInvalidTokens(invalidTokens);

    this.logger.log(
      `📱 Incoming call push sent: ${callId} → callee ${calleeId.slice(0, 8)}… (${tokens.length} device(s))`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Cancel incoming call push (data-only → client dismisses UI)
  // ─────────────────────────────────────────────────────────────────────

  async cancelCallNotification(callId: string, userId: string): Promise<void> {
    const tokens = await this.deviceTokens.getTokensByUserId(userId);
    if (tokens.length === 0) return;

    // Data-only message: instructs client app/SW to dismiss the ringing UI
    const data: Record<string, string> = {
      type: 'CANCEL_CALL',
      callId,
      timestamp: new Date().toISOString(),
    };

    const { invalidTokens } = await this.firebase.sendMulticast(tokens, data, {
      priority: 'high',
      ttlSeconds: 30, // Also short TTL since it's just a dismissal
    });

    await this.deviceTokens.cleanupInvalidTokens(invalidTokens);

    this.logger.log(
      `📱 Cancel call push sent: ${callId} → user ${userId.slice(0, 8)}… (${tokens.length} device(s))`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Missed call (NORMAL priority, notification payload)
  // ─────────────────────────────────────────────────────────────────────

  async sendMissedCallPush(params: MissedCallPushParams): Promise<void> {
    const {
      callId,
      callType,
      callerId,
      callerName,
      callerAvatar,
      calleeId,
      isGroupCall,
      conversationName,
    } = params;

    const tokens = await this.deviceTokens.getTokensByUserId(calleeId);
    if (tokens.length === 0) return;

    const callTypeLabel = callType === 'VIDEO' ? 'video' : 'thoại';

    // Group-aware notification content
    const title = isGroupCall ? 'Cuộc gọi nhóm nhỡ' : 'Cuộc gọi nhỡ';
    const body = isGroupCall
      ? conversationName
        ? `Cuộc gọi nhóm ${callTypeLabel} nhỡ từ ${conversationName}`
        : `${callerName} đã gọi nhóm ${callTypeLabel}`
      : `${callerName} đã gọi ${callTypeLabel} cho bạn`;

    // Data-only message — consistent with plan §10 (all push = data-only).
    // SW renders the browser notification from the data fields.
    // Avoids Firebase SDK auto-display of notification-type messages.
    const data: Record<string, string> = {
      type: 'MISSED_CALL',
      callId,
      callType,
      callerId,
      callerName,
      callerAvatar: callerAvatar ?? '',
      title,
      body,
      timestamp: new Date().toISOString(),
    };

    const { invalidTokens } = await this.firebase.sendMulticast(tokens, data, {
      priority: 'normal',
      ttlSeconds: 3600,
    });

    await this.deviceTokens.cleanupInvalidTokens(invalidTokens);

    this.logger.log(
      `📱 Missed call push sent: ${callId} → callee ${calleeId.slice(0, 8)}…`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Message push (data-only, for offline users — Phase 1)
  // ─────────────────────────────────────────────────────────────────────

  async sendMessagePush(params: MessagePushParams): Promise<void> {
    const {
      recipientId,
      conversationId,
      conversationType,
      senderName,
      messageContent,
      messageCount,
      conversationName,
      senderId,
    } = params;

    const tokens = await this.deviceTokens.getTokensByUserId(recipientId);
    if (tokens.length === 0) return;

    // Compose title/body based on conversation type and batch count
    const { title, body } = this.composeMessageNotification({
      conversationType,
      senderName,
      messageContent,
      messageCount,
      conversationName,
    });

    // Data-only message — SW renders browser notification
    const data: Record<string, string> = {
      type: 'NEW_MESSAGE',
      conversationId,
      conversationType,
      senderId,
      senderName,
      messageCount: String(messageCount),
      title,
      body,
      timestamp: new Date().toISOString(),
    };

    const { invalidTokens } = await this.firebase.sendMulticast(tokens, data, {
      priority: 'normal',
      ttlSeconds: 300, // 5 minutes — messages aren't as urgent as calls
    });

    await this.deviceTokens.cleanupInvalidTokens(invalidTokens);

    this.logger.log(
      `📱 Message push sent: conv=${conversationId.slice(0, 8)}… → user=${recipientId.slice(0, 8)}… (${messageCount} msg, ${tokens.length} device(s))`,
    );
  }

  /**
   * Compose notification title/body based on context.
   * Keeps push text logic in one place — easy to customize.
   */
  private composeMessageNotification(params: {
    conversationType: 'DIRECT' | 'GROUP';
    senderName: string;
    messageContent: string;
    messageCount: number;
    conversationName: string | null;
  }): { title: string; body: string } {
    const {
      conversationType,
      senderName,
      messageCount,
      conversationName,
    } = params;

    if (conversationType === 'GROUP') {
      const title = conversationName || 'Nhóm chat';
      if (messageCount > 1) {
        return { title, body: `${messageCount} tin nhắn mới` };
      }
      return { title, body: `${senderName}: ${params.messageContent}` };
    }

    // DIRECT
    if (messageCount > 1) {
      return { title: senderName, body: `Đã gửi ${messageCount} tin nhắn` };
    }
    return { title: senderName, body: params.messageContent };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Friendship push (data-only, no batching — low frequency events)
  // ─────────────────────────────────────────────────────────────────────

  async sendFriendRequestPush(params: FriendRequestPushParams): Promise<void> {
    const { recipientId, fromUserId, fromUserName, fromUserAvatar, requestId } =
      params;

    const tokens = await this.deviceTokens.getTokensByUserId(recipientId);
    if (tokens.length === 0) return;

    const data: Record<string, string> = {
      type: 'FRIEND_REQUEST',
      fromUserId,
      fromUserName,
      fromUserAvatar: fromUserAvatar ?? '',
      requestId,
      title: 'Lời mời kết bạn',
      body: `${fromUserName} muốn kết bạn với bạn`,
      timestamp: new Date().toISOString(),
    };

    const { invalidTokens } = await this.firebase.sendMulticast(tokens, data, {
      priority: 'normal',
      ttlSeconds: 3600, // 1 hour — friend requests aren't urgent
    });

    await this.deviceTokens.cleanupInvalidTokens(invalidTokens);

    this.logger.log(
      `📱 Friend request push sent: ${fromUserId.slice(0, 8)}… → ${recipientId.slice(0, 8)}… (${tokens.length} device(s))`,
    );
  }

  async sendFriendAcceptedPush(
    params: FriendAcceptedPushParams,
  ): Promise<void> {
    const {
      recipientId,
      acceptedByUserId,
      acceptedByName,
      acceptedByAvatar,
      friendshipId,
    } = params;

    const tokens = await this.deviceTokens.getTokensByUserId(recipientId);
    if (tokens.length === 0) return;

    const data: Record<string, string> = {
      type: 'FRIEND_ACCEPTED',
      acceptedByUserId,
      acceptedByName,
      acceptedByAvatar: acceptedByAvatar ?? '',
      friendshipId,
      title: 'Kết bạn thành công',
      body: `${acceptedByName} đã chấp nhận lời mời kết bạn`,
      timestamp: new Date().toISOString(),
    };

    const { invalidTokens } = await this.firebase.sendMulticast(tokens, data, {
      priority: 'normal',
      ttlSeconds: 3600,
    });

    await this.deviceTokens.cleanupInvalidTokens(invalidTokens);

    this.logger.log(
      `📱 Friend accepted push sent: ${acceptedByUserId.slice(0, 8)}… → ${recipientId.slice(0, 8)}… (${tokens.length} device(s))`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Group event push (data-only, no batching — low frequency events)
  // ─────────────────────────────────────────────────────────────────────

  async sendGroupEventPush(params: GroupEventPushParams): Promise<void> {
    const { recipientId, conversationId, subtype, groupName, title, body } =
      params;

    const tokens = await this.deviceTokens.getTokensByUserId(recipientId);
    if (tokens.length === 0) return;

    const data: Record<string, string> = {
      type: 'GROUP_EVENT',
      subtype,
      conversationId,
      groupName,
      title,
      body,
      timestamp: new Date().toISOString(),
    };

    const { invalidTokens } = await this.firebase.sendMulticast(tokens, data, {
      priority: 'normal',
      ttlSeconds: 3600,
    });

    await this.deviceTokens.cleanupInvalidTokens(invalidTokens);

    this.logger.log(
      `📱 Group event push sent: ${subtype} conv=${conversationId.slice(0, 8)}… → user=${recipientId.slice(0, 8)}… (${tokens.length} device(s))`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Reminder push (data-only, no batching)
  // ─────────────────────────────────────────────────────────────────────

  async sendReminderPush(params: ReminderPushParams): Promise<void> {
    const {
      recipientId,
      reminderId,
      content,
      conversationId,
      creatorId,
      title,
      body,
    } = params;

    const tokens = await this.deviceTokens.getTokensByUserId(recipientId);
    if (tokens.length === 0) return;

    const data: Record<string, string> = {
      type: 'REMINDER_TRIGGERED',
      reminderId,
      content,
      conversationId: conversationId ?? '',
      creatorId,
      title,
      body,
      timestamp: new Date().toISOString(),
    };

    const { invalidTokens } = await this.firebase.sendMulticast(tokens, data, {
      priority: 'high', // Reminders are time-sensitive
      ttlSeconds: 3600, // 1 hour — reminder is stale if delivered much later
    });

    await this.deviceTokens.cleanupInvalidTokens(invalidTokens);

    this.logger.log(
      `📱 Reminder push sent: ${reminderId.slice(0, 8)}… → user=${recipientId.slice(0, 8)}… (${tokens.length} device(s))`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Generic push (for future use — chat notifications, etc.)
  // ─────────────────────────────────────────────────────────────────────

  async sendPushToUser(
    userId: string,
    notification: { title: string; body: string; imageUrl?: string },
    data?: Record<string, string>,
  ): Promise<void> {
    const tokens = await this.deviceTokens.getTokensByUserId(userId);
    if (tokens.length === 0) return;

    const { invalidTokens } = await this.firebase.sendNotification(
      tokens,
      notification,
      data,
    );

    await this.deviceTokens.cleanupInvalidTokens(invalidTokens);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Login Approval (2FA PUSH)
  // ─────────────────────────────────────────────────────────────────────

  async sendLoginApprovalPush(params: LoginApprovalPushParams): Promise<void> {
    const { userId, deviceName, location, ipAddress, pendingToken } = params;

    const tokens = await this.deviceTokens.getTokensByUserId(userId);
    if (tokens.length === 0) return;

    // Data-only message: App handles the approval UI
    const data: Record<string, string> = {
      type: 'LOGIN_APPROVAL',
      deviceName,
      location: location ?? 'Vị trí không xác định',
      ipAddress: ipAddress ?? 'IP không xác định',
      pendingToken,
      timestamp: new Date().toISOString(),
    };

    const { invalidTokens } = await this.firebase.sendMulticast(tokens, data, {
      priority: 'high',
      ttlSeconds: 300, // 5 minutes TTL for 2FA
    });

    await this.deviceTokens.cleanupInvalidTokens(invalidTokens);

    this.logger.log(
      `📱 Login approval push sent to user ${userId.slice(0, 8)}… (${tokens.length} device(s))`,
    );
  }
}
