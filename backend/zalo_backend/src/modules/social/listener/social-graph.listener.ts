/**
 * Social Graph Event Listeners
 *
 * Handles cross-module integration through events:
 * - Block events → Disconnect sockets, terminate calls
 * - Unfriend events → Update permissions, terminate calls
 * - Privacy events → Invalidate permission cache
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CallHistoryService } from '../service/call-history.service';
import {
  CallStatus,
  ConversationType,
  Gender,
  PrivacyLevel,
} from '@prisma/client';

/**
 * ==============================================================================
 * STRICT EVENT PAYLOADS
 * ==============================================================================
 */

// 1. BLOCKING EVENTS
export interface UserBlockedEvent {
  blockerId: string;
  blockedId: string;
  blockId: string; // UUID from Block table
  reason?: string; // Optional: For audit log
}

export interface UserUnblockedEvent {
  blockerId: string;
  blockedId: string;
  blockId: string; // Reference to the deleted record ID (for audit)
}

// 2. FRIENDSHIP EVENTS
export interface FriendshipRemovedEvent {
  friendshipId: string;
  removedBy: string; // User ID who performed the action
  user1Id: string;
  user2Id: string;
}

export interface FriendshipAcceptedEvent {
  friendshipId: string; // UUID from Friendship table
  acceptedBy: string; // User ID who clicked "Accept"
  requesterId: string; // User ID who sent the request
}

// 3. PRIVACY EVENTS
export interface PrivacyUpdatedEvent {
  userId: string;
  // Sử dụng Partial vì user có thể chỉ update 1 setting tại 1 thời điểm
  // Các field map với PrivacySettings model
  settings: {
    showProfile?: PrivacyLevel;
    whoCanMessageMe?: PrivacyLevel;
    whoCanCallMe?: PrivacyLevel;
    showOnlineStatus?: boolean;
    showLastSeen?: boolean;
  };
}

// 4. CALL EVENTS (Updated for Call History Logic)
export interface CallTerminatedEvent {
  callId: string;
  conversationId: string;
  callerId: string;
  calleeId: string;

  startedAt: Date;
  endedAt: Date;
  duration: number; // Duration in seconds

  status: CallStatus; // Trạng thái cuộc gọi (Nhỡ, Nghe máy...)
  reason?: string; // Lý do kết thúc (Bị chặn, Mất mạng...)
}

// 5. NEW EVENTS (Added in previous step)
export interface UserProfileUpdatedEvent {
  userId: string;
  updates: {
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
    gender?: Gender;
    dateOfBirth?: Date;
  };
}

export interface FriendRequestSentEvent {
  requestId: string;
  fromUserId: string;
  toUserId: string;
  timestamp: Date;
}

export interface FriendRequestCancelledEvent {
  requestId?: string;
  fromUserId: string;
  toUserId: string;
  action: 'CANCELLED' | 'DECLINED';
}

export interface ConversationMemberAddedEvent {
  conversationId: string;
  addedByUserId: string;
  newMemberIds: string[];
  type: ConversationType;
}

export interface ConversationMemberLeftEvent {
  conversationId: string;
  removedUserId: string;
  removedByUserId: string;
  reason?: string;
}

export interface AuthSecurityRevokedEvent {
  userId: string;
  reason:
    | 'PASSWORD_CHANGE'
    | 'MANUAL_LOGOUT_ALL'
    | 'SECURITY_RISK'
    | 'TOKEN_ROTATION'; //
  excludeDeviceId?: string;
}
@Injectable()
export class SocialGraphEventListener {
  private readonly logger = new Logger(SocialGraphEventListener.name);

  constructor(
    private readonly callHistoryService: CallHistoryService,
    // NOTE: SocketGateway will be injected when available
    // private readonly socketGateway: SocketGateway,
  ) {}

  /**
   * ==================================================================================
   * GROUP 1: BLOCKING LOGIC (High Priority - Impact User Experience & Privacy)
   * ==================================================================================
   */

  /**
   * Handle user.blocked event
   * * @description Xử lý ngay lập tức khi A chặn B.
   * Chiến lược: "Kill connection -> Invalidate Cache -> Update UI Realtime"
   */
  @OnEvent('user.blocked')
  async handleUserBlocked(payload: UserBlockedEvent): Promise<void> {
    const { blockerId, blockedId } = payload;
    this.logger.log(`[BLOCK] Processing: ${blockerId} blocked ${blockedId}`);

    try {
      // STEP 1: Xử lý Call Service (Critical - Immediate Action)
      // Nếu đang trong cuộc gọi 1-1, CallService phải ngắt kết nối WebRTC ngay.
      // Logic: Gửi signal "CALL_ENDED" với reason "BLOCKED".
      await this.callHistoryService.terminateActiveCall(blockerId, blockedId);

      // STEP 2: Invalidate Privacy Cache (Redis)
      // Hệ thống chat thường cache quyền "CanMessage". Cần xóa key này ngay.
      // Key format gợi ý: `privacy:can_message:${blockerId}:${blockedId}`
      // await this.cacheManager.del(`privacy:can_message:${blockerId}:${blockedId}`);
      // await this.cacheManager.del(`privacy:can_message:${blockedId}:${blockerId}`);

      // STEP 3: Socket Room Management (Presence)
      // Người bị chặn không được phép nhìn thấy trạng thái Online/Typing của người chặn.
      // Action: Force user B leave room `presence:user:${blockerId}`
      // await this.socketGateway.removeUserFromRoom(blockedId, `presence:user:${blockerId}`);

      // STEP 4: Realtime UI Update
      // Gửi event xuống client của cả 2 user để disable input chat, ẩn avatar/bio (tùy privacy).
      // Event: 'chat.blocked_update'
      // await this.socketGateway.emitToUser(blockedId, 'chat.blocked_update', { byUser: blockerId, type: 'BLOCKED' });
      // await this.socketGateway.emitToUser(blockerId, 'chat.blocked_update', { targetUser: blockedId, type: 'BLOCKING' });

      this.logger.log(
        `[BLOCK] Complete actions for ${blockerId} -> ${blockedId}`,
      );
    } catch (error) {
      this.logger.error(`[BLOCK] Failed to handle event:`, error);
    }
  }

  /**
   * Handle user.unblocked event
   * * @description Khôi phục khả năng tương tác.
   */
  @OnEvent('user.unblocked')
  async handleUserUnblocked(payload: UserUnblockedEvent): Promise<void> {
    const { blockerId, blockedId } = payload;
    this.logger.log(
      `[UNBLOCK] Processing: ${blockerId} unblocked ${blockedId}`,
    );

    try {
      // STEP 1: Invalidate Privacy Cache (Redis)
      // Xóa cache cũ (trạng thái chặn) để request chat tiếp theo được phép đi qua.
      // await this.cacheManager.del(`privacy:can_message:${blockerId}:${blockedId}`);
      // STEP 2: Realtime UI Update
      // Bắn event để client enable lại ô input chat.
      // Event: 'chat.blocked_update' -> status: 'NORMAL'
      // await this.socketGateway.emitToUser(blockedId, 'chat.blocked_update', { byUser: blockerId, type: 'NORMAL' });
      // Note: Không auto-add lại vào room Presence. Client sẽ tự subscribe lại khi user F5 hoặc mở lại app.
    } catch (error) {
      this.logger.error(`[UNBLOCK] Failed to handle event:`, error);
    }
  }

  /**
   * ==================================================================================
   * GROUP 2: FRIENDSHIP LOGIC (Social Graph Updates)
   * ==================================================================================
   */

  /**
   * Handle friendship.removed event (Unfriend)
   * * @description Xử lý khi hủy kết bạn.
   * Ảnh hưởng: Danh bạ, Quyền xem nhật ký, Trạng thái Online.
   */
  @OnEvent('friendship.removed')
  async handleFriendshipRemoved(
    payload: FriendshipRemovedEvent,
  ): Promise<void> {
    const { user1Id, user2Id } = payload;
    this.logger.log(`[UNFRIEND] Processing: ${user1Id} <-> ${user2Id}`);

    try {
      // STEP 1: Update Contact List Cache
      // Invalidate cache danh sách bạn bè của cả 2 user.
      // await this.cacheManager.del(`user:friends:${user1Id}`);
      // await this.cacheManager.del(`user:friends:${user2Id}`);
      // STEP 2: Presence Unsubscription
      // Nếu user1 đang subscribe kênh `presence:user:${user2Id}`, cần remove ra ngay.
      // Bạn bè mới được thấy online (thường là default privacy).
      // await this.socketGateway.unsubscribePresence(user1Id, user2Id);
      // await this.socketGateway.unsubscribePresence(user2Id, user1Id);
      // STEP 3: Notify Clients
      // Cập nhật UI: Xóa khỏi danh sách bạn bè, đổi nút chat thành "Kết bạn".
      // await this.socketGateway.emitToUser(user1Id, 'friendship.update', { userId: user2Id, status: 'NONE' });
      // await this.socketGateway.emitToUser(user2Id, 'friendship.update', { userId: user1Id, status: 'NONE' });
      // Note: Không terminate call. Unfriend vẫn có thể call (tùy setting Privacy 'WhoCanCallMe').
    } catch (error) {
      this.logger.error(`[UNFRIEND] Failed to handle event:`, error);
    }
  }

  /**
   * Handle friendship.accepted event
   * * @description Sự kiện quan trọng để "Warm up" hội thoại.
   */
  @OnEvent('friendship.accepted')
  async handleFriendshipAccepted(
    payload: FriendshipAcceptedEvent,
  ): Promise<void> {
    const { acceptedBy, requesterId, friendshipId } = payload;
    this.logger.log(`[FRIEND_ACCEPTED] ${acceptedBy} & ${requesterId}`);

    try {
      // STEP 1: Auto-Create or Retrieve Conversation
      // Khi thành bạn bè, user thường muốn chat ngay.
      // Check DB: Nếu chưa có DIRECT conversation -> Tạo mới ngay lập tức.
      // const conversation = await this.conversationService.getOrCreateDirectConversation(acceptedBy, requesterId);
      // STEP 2: Insert System Message (Optional but Recommended)
      // Ghi vào box chat: "Hai bạn đã trở thành bạn bè. Hãy bắt đầu trò chuyện!"
      // await this.messageService.createSystemMessage(conversation.id, 'FRIENDSHIP_ESTABLISHED');
      // STEP 3: Notify Clients
      // - Client A & B: Thêm user kia vào danh sách bạn bè (UI Contact List).
      // - Client A & B: Update UI box chat (Enable các tính năng chỉ dành cho bạn bè như gửi tiền, HD photo...).
      // await this.socketGateway.emitToUser(acceptedBy, 'friendship.new', { friend: requesterId });
      // await this.socketGateway.emitToUser(requesterId, 'friendship.new', { friend: acceptedBy });
    } catch (error) {
      this.logger.error(`[FRIEND_ACCEPTED] Failed to handle event:`, error);
    }
  }

  /**
   * ==================================================================================
   * GROUP 3: PRIVACY & SYSTEM
   * ==================================================================================
   */

  /**
   * Handle privacy.updated event
   * * @description User thay đổi settings (VD: Tắt trạng thái Online, Chặn người lạ nhắn tin).
   */
  @OnEvent('privacy.updated')
  async handlePrivacyUpdated(payload: PrivacyUpdatedEvent): Promise<void> {
    const { userId, settings } = payload;
    this.logger.debug(`[PRIVACY] Updated for ${userId}`, settings);

    // STEP 1: Update Presence Logic
    if (settings.showOnlineStatus === 'NOBODY') {
      // Nếu tắt trạng thái online -> Gửi fake event "Offline" cho toàn bộ bạn bè đang subscribe.
      // await this.socketGateway.broadcastPresence(userId, 'OFFLINE');
    }

    // STEP 2: Invalidate Permission Cache
    // Bắt buộc xóa cache để các logic check quyền (Guard) ở MessageController phải load lại DB.
    // await this.cacheManager.del(`privacy:settings:${userId}`);

    // Note: Không cần notify UI người khác, trừ việc cập nhật trạng thái online.
  }

  /**
   * Handle call.terminated event
   * * @description Kết thúc cuộc gọi -> Cần lưu log vào khung chat.
   */
  @OnEvent('call.terminated')
  async handleCallTerminated(payload: CallTerminatedEvent): Promise<void> {
    const { callId, callerId, calleeId, duration, status, conversationId } =
      payload;
    this.logger.log(`[CALL_ENDED] Duration: ${duration}s, Status: ${status}`);

    try {
      // STEP 1: Insert System Message into Chat
      // Tạo một record trong bảng Message (type: SYSTEM hoặc CALL_HISTORY).
      // Nội dung: "Cuộc gọi thoại - 5 phút 23 giây" hoặc "Cuộc gọi nhỡ".
      // await this.messageService.create({
      //   conversationId,
      //   senderId: callerId,
      //   type: 'CALL_HISTORY',
      //   metadata: { duration, status, callId }
      // });
      // STEP 2: Push Notification (Missed Call)
      // Nếu là cuộc gọi nhỡ (status === 'MISSED' hoặc 'NO_ANSWER'), bắn Push cho người nhận.
      // if (status === 'MISSED') {
      //   await this.notificationService.sendPush(calleeId, {
      //     title: 'Cuộc gọi nhỡ',
      //     body: `Bạn có cuộc gọi nhỡ từ ${callerId}`
      //   });
      // }
      // STEP 3: Socket Update
      // Báo cho UI update dòng trạng thái cuối cùng (Last Message) của hội thoại.
    } catch (error) {
      this.logger.error(`[CALL_ENDED] Failed to handle event:`, error);
    }
  }

  /**
   * Handle friendship.request.sent
   * * Mục tiêu: Tăng tính tương tác (Engagement)
   */
  @OnEvent('friendship.request.sent')
  async handleFriendRequestSent(
    payload: FriendRequestSentEvent,
  ): Promise<void> {
    const { fromUserId, toUserId } = payload;
    this.logger.log(`Friend request sent: ${fromUserId} -> ${toUserId}`);

    try {
      // 1. Socket Notification (Real-time):
      // Gửi event "notification.new" tới user nhận (toUserId).
      // Client sẽ hiện chấm đỏ (badge) ở tab Danh bạ.
      // await this.socketGateway.sendNotification(toUserId, { type: 'FRIEND_REQUEST', from: fromUserId });
      // 2. Push Notification (FCM - Mobile):
      // Nếu user đang Offline, bắn FCM notification: "A đã gửi lời mời kết bạn".
      // await this.notificationService.sendPush(toUserId, ...);
    } catch (error) {
      this.logger.error('Error handling friend request sent:', error);
    }
  }

  /**
   * Handle friendship.request.cancelled / declined
   * * Mục tiêu: Dọn dẹp UI
   */
  @OnEvent('friendship.request.cancelled')
  async handleFriendRequestCancelled(
    payload: FriendRequestCancelledEvent,
  ): Promise<void> {
    const { fromUserId, toUserId, action } = payload;

    // 1. Socket Update:
    // Gửi event tới cả 2 user để update UI nút bấm (từ "Đang chờ" -> "Kết bạn").
    // await this.socketGateway.emitToUser(toUserId, 'friendship.status_update', { userId: fromUserId, status: 'NONE' });

    // 2. Clear Notification:
    // Nếu có noti chưa đọc liên quan đến request này, hãy xóa nó đi để tránh rác.
  }

  // ==========================================
  // SECTION: CONVERSATION & GROUP (Core Chat)
  // ==========================================

  /**
   * Handle conversation.member.added
   * * Mục tiêu: Đồng bộ danh sách chat
   */
  @OnEvent('conversation.member.added')
  async handleMemberAdded(
    payload: ConversationMemberAddedEvent,
  ): Promise<void> {
    const { conversationId, newMemberIds, addedByUserId, type } = payload;
    this.logger.log(`Members added to conversation ${conversationId}`);

    // 1. Notify New Members (QUAN TRỌNG):
    // Những user mới này chưa có conversation này trong local DB/State của họ.
    // Cần bắn full conversation data để client render ngay lập tức vào đầu danh sách chat.
    // await this.socketGateway.emitConversationCreated(newMemberIds, conversationId);

    // 2. Notify Existing Members:
    // Báo cho những người đang ở trong nhóm: "A đã thêm B vào nhóm".
    // Client sẽ update lại UI (số lượng thành viên, list member).
    // await this.socketGateway.emitSystemMessage(conversationId, ...);
  }

  /**
   * Handle conversation.member.left
   * * Mục tiêu: Security & Cleanup
   */
  @OnEvent('conversation.member.left')
  async handleMemberLeft(payload: ConversationMemberLeftEvent): Promise<void> {
    const { conversationId, removedUserId, removedByUserId } = payload;

    // 1. Terminate Active Calls (WebRTC):
    // Nếu nhóm đang có cuộc gọi video, và user này đang join -> Force disconnect ngay lập tức.
    // await this.callHistoryService.forceDisconnectUser(conversationId, removedUserId);

    // 2. Socket Action cho User bị xóa:
    // Gửi lệnh xóa hội thoại khỏi danh sách chat (hoặc chuyển sang read-only).
    // await this.socketGateway.emitConversationRemoved(removedUserId, conversationId);

    // 3. Socket Action cho thành viên còn lại:
    // Update lại UI: "A đã rời nhóm" hoặc "A đã bị mời ra khỏi nhóm".
  }

  // ==========================================
  // SECTION: USER PROFILE & CONSISTENCY
  // ==========================================

  /**
   * Handle user.profile.updated
   * * Mục tiêu: Nhất quán dữ liệu hiển thị (Consistency)
   */
  @OnEvent('user.profile.updated')
  async handleUserProfileUpdated(
    payload: UserProfileUpdatedEvent,
  ): Promise<void> {
    const { userId, updates } = payload;

    // 1. Cache Invalidation:
    // Xóa cache user profile trong Redis (nếu có) để các query sau lấy data mới.

    // 2. Broadcast tới các Active Conversations (Advanced):
    // Tìm các hội thoại mà user này đang tham gia.
    // Bắn socket event tới các thành viên trong các nhóm đó:
    // "User A đổi avatar" -> Client tự động refresh ảnh A mà không cần reload app.
    // NOTE: Cần xử lý cẩn thận kẻo spam socket nếu user đổi info liên tục.
    // await this.socketGateway.broadcastProfileUpdate(userId, updates);
  }

  // ==========================================
  // SECTION: SECURITY (Critical)
  // ==========================================

  /**
   * Handle auth.security.revoked
   * * Mục tiêu: Force Logout ngay lập tức
   */
  @OnEvent('auth.security.revoked')
  async handleSecurityRevoked(
    payload: AuthSecurityRevokedEvent,
  ): Promise<void> {
    const { userId, reason, excludeDeviceId } = payload;
    this.logger.warn(`Security revocation for user ${userId}: ${reason}`);

    // 1. Disconnect Socket:
    // Tìm tất cả socketId của userId này (trong Redis Adapter).
    // Trừ socket gắn với excludeDeviceId (thiết bị user đang dùng để đổi pass).
    // Gọi lệnh disconnect(true).

    // 2. Emit Logout Event:
    // Gửi event "auth.force_logout" xuống client để App xóa token ở local storage
    // và redirect về màn hình Login.
    // await this.socketGateway.forceLogoutUser(userId, excludeDeviceId);
  }
}
