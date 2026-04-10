/**
 * R9: Redis Key Builder - Consistent Key Management
 *
 * Centralized Redis key generation for all domains.
 * Ensures:
 * - Consistent naming conventions across services
 * - Type-safe key generation (no string literals)
 * - Easy refactoring of key structures
 * - Clear separation of domains/namespaces
 *
 * Key Format: `{DOMAIN}:{ENTITY}:{ID}[:{FIELD}]`
 * Example: `FRIENDSHIP:PENDING_REQUESTS:user-123`
 *
 * Benefits:
 * - Prevents key collisions
 * - Makes cache invalidation patterns clear
 * - Enables pattern-based deletion
 * - Single source of truth for key structure
 */

import { PermissionActionType } from '@common/constants/permission-actions.constant';

export class RedisKeyBuilder {
  /**
   * FRIENDSHIP domain keys
   */
  static readonly DOMAIN_FRIENDSHIP = 'FRIENDSHIP';
  static readonly DOMAIN_BLOCK = 'BLOCK';
  static readonly DOMAIN_CALL = 'CALL';
  static readonly DOMAIN_MESSAGING = 'MESSAGING';
  static readonly DOMAIN_SOCIAL = 'SOCIAL';
  static readonly DOMAIN_RATELIMIT = 'RATELIMIT';
  static readonly DOMAIN_SOCKET = 'SOCKET';
  static readonly DOMAIN_PRESENCE = 'PRESENCE';
  static readonly DOMAIN_CONTACT = 'CONTACT';
  static readonly DOMAIN_NOTIFICATION = 'NOTIFICATION';
  static readonly DOMAIN_AUTH = 'AUTH';

  /**
   * DOMAIN_SOCIAL: Namespace prefix cho social graph (Block, Friendship, Privacy).
   * Không phải tên module - chỉ là nhóm Redis key. Keys: SOCIAL:BLOCK, SOCIAL:FRIENDSHIP,
   * SOCIAL:PRIVACY, SOCIAL:PERMISSION. Giữ nguyên để tránh invalidate cache.
   */

  // ============ SOCKET KEYS (format legacy: user:, socket:) ============

  /** Pattern: user:{userId}:sockets */
  static userSockets(userId: string): string {
    return `user:${userId}:sockets`;
  }

  /** Pattern: socket:{socketId}:user */
  static socketUser(socketId: string): string {
    return `socket:${socketId}:user`;
  }

  // ============ PRESENCE KEYS ============

  /** Sorted set: presence:online_users */
  static presenceOnlineUsers(): string {
    return 'presence:online_users';
  }

  /** Pattern: user:{userId}:status */
  static userStatus(userId: string): string {
    return `user:${userId}:status`;
  }

  /** Pattern: user:{userId}:devices */
  static userDevices(userId: string): string {
    return `user:${userId}:devices`;
  }

  // ============ PUB/SUB CHANNELS ============

  static readonly channels = {
    presenceOnline: 'socket:presence:online',
    presenceOffline: 'socket:presence:offline',
    broadcast: 'socket:broadcast',
    newMessage: (conversationId: string) => `chat:msg:${conversationId}`,
    globalNewMessage: 'chat:new_message',
    receipt: (userId: string) => `chat:receipt:${userId}`,
    typing: (conversationId: string) => `chat:typing:${conversationId}`,
  } as const;

  // ============ MESSAGING CACHE ============

  /** Message idempotency (TTL: 5min) */
  static messageIdempotency(clientMsgId: string): string {
    return `msg:dedup:${clientMsgId}`;
  }

  /** Offline message queue (sorted set) */
  static offlineMessages(userId: string): string {
    return `user:${userId}:offline_msgs`;
  }

  // ============ CONTACT KEYS ============

  /** Contact alias/name cache: contact:name:{ownerId}:{contactId} */
  static contactName(ownerId: string, contactId: string): string {
    return `contact:name:${ownerId}:${contactId}`;
  }

  // ============ CALL KEYS (legacy format) ============

  static callActiveSession(callId: string): string {
    return `call:session:${callId}`;
  }

  static callEndLock(callId: string): string {
    return `call:end_lock:${callId}`;
  }

  static callResult(callId: string): string {
    return `call:result:${callId}`;
  }

  static missedCallsViewedAt(userId: string): string {
    return `call:missed:viewed_at:${userId}`;
  }

  static missedCallsCount(userId: string): string {
    return `call:missed:count:${userId}`;
  }

  // ============ AUTH KEYS ============

  /** JWT strategy user profile cache: AUTH:USER_PROFILE:{userId} (TTL: 5min) */
  static authUserProfile(userId: string): string {
    return `AUTH:USER_PROFILE:${userId}`;
  }

  /** Email OTP for forgot password: AUTH:EMAIL_OTP:{email} (TTL: 5min) - DEPRECATED: use accountOtp instead */
  static emailOtp(email: string): string {
    return `${this.DOMAIN_AUTH}:EMAIL_OTP:${email}`;
  }

  /** Password reset token for forgot password: auth:password-reset:{token} (TTL: 5min) */
  static accountPasswordResetToken(token: string): string {
    return `auth:password-reset:${token}`;
  }

  /** Account-based OTP for forgot password: AUTH:ACCOUNT_OTP:{userId} (TTL: 90s) */
  static accountOtp(userId: string): string {
    return `${this.DOMAIN_AUTH}:ACCOUNT_OTP:${userId}`;
  }

  /** OTP Request Cooldown: AUTH:OTP_COOLDOWN:{userId} (TTL: 45s) */
  static accountOtpCooldown(userId: string): string {
    return `${this.DOMAIN_AUTH}:OTP_COOLDOWN:${userId}`;
  }

  /** Registration OTP: AUTH:REGISTER_OTP:{phone} (TTL: 90s) */
  static registerOtp(phone: string): string {
    return `${this.DOMAIN_AUTH}:REGISTER_OTP:${phone}`;
  }

  /** Registration OTP Cooldown: AUTH:REGISTER_OTP_COOLDOWN:{phone} (TTL: 45s) */
  static registerOtpCooldown(phone: string): string {
    return `${this.DOMAIN_AUTH}:REGISTER_OTP_COOLDOWN:${phone}`;
  }

  /** Registration Verified Flag: AUTH:REGISTER_VERIFIED:{phone} (TTL: 10m) */
  static registerVerified(phone: string): string {
    return `${this.DOMAIN_AUTH}:REGISTER_VERIFIED:${phone}`;
  }

  /** distributed lock for security operations: AUTH:SECURITY_LOCK:{userId} (TTL: 10s) */
  static userSecurityLock(userId: string): string {
    return `${this.DOMAIN_AUTH}:SECURITY_LOCK:${userId}`;
  }

  /** distributed lock for phone-based operations: AUTH:PHONE_SECURITY_LOCK:{phone} (TTL: 10s) */
  static phoneSecurityLock(phone: string): string {
    return `${this.DOMAIN_AUTH}:PHONE_SECURITY_LOCK:${phone}`;
  }

  /** Login fail counter: auth:login_fail:{phoneNumber} (TTL: 15m) */
  static loginFailCount(phoneNumber: string): string {
    return `auth:login_fail:${phoneNumber}`;
  }

  /** Login locked flag: auth:login_locked:{phoneNumber} (TTL: 15m) */
  static loginLocked(phoneNumber: string): string {
    return `auth:login_locked:${phoneNumber}`;
  }

  // ============ 2FA KEYS ============

  /** Temporary secret during 2FA setup: auth:2fa_setup_secret:{userId} (TTL: 10m) */
  static twoFactorPendingSetup(userId: string): string {
    return `auth:2fa_setup_secret:${userId}`;
  }

  /** Pending 2FA authentication state for login: auth:2fa_pending:{pendingToken} (TTL: 5m) */
  static twoFactorPending(pendingToken: string): string {
    return `auth:2fa_pending:${pendingToken}`;
  }

  /** SMS OTP for 2FA fallback: auth:2fa_sms_otp:{userId} (TTL: 3m) */
  static twoFactorSmsOtp(userId: string): string {
    return `auth:2fa_sms_otp:${userId}`;
  }

  /** Email OTP for 2FA fallback: auth:2fa_email_otp:{userId} (TTL: 5m) */
  static twoFactorEmailOtp(userId: string): string {
    return `auth:2fa_email_otp:${userId}`;
  }

  /** Rate limit cooldown for 2FA challenge requests: auth:2fa_cooldown:{userId}:{method} (TTL: 60s) */
  static twoFactorCooldown(userId: string, method: string): string {
    return `auth:2fa_cooldown:${userId}:${method.toUpperCase()}`;
  }

  // ============ QR LOGIN KEYS ============

  /** QR session data: AUTH:QR_SESSION:{qrSessionId} (TTL: 180s) */
  static qrSession(qrSessionId: string): string {
    return `${this.DOMAIN_AUTH}:QR_SESSION:${qrSessionId}`;
  }

  /** Distributed lock for token exchange: AUTH:QR_LOCK:{userId} (TTL: 5s) */
  static qrSessionLock(userId: string): string {
    return `${this.DOMAIN_AUTH}:QR_LOCK:${userId}`;
  }

  /** Rate-limit for QR exchange: AUTH:QR_RATE_LIMIT:{qrSessionId} */
  static qrExchangeRateLimit(qrSessionId: string): string {
    return `${this.DOMAIN_AUTH}:QR_RATE_LIMIT:${qrSessionId}`;
  }

  /** Device Attestation Challenge: AUTH:ATTEST_CHALLENGE:{userId} (TTL: 60s) */
  static deviceAttestChallenge(userId: string): string {
    return `${this.DOMAIN_AUTH}:ATTEST_CHALLENGE:${userId}`;
  }

  // ============ RATE LIMIT (legacy format) ============

  static rateLimitContactSync(userId: string): string {
    return `ratelimit:contact_sync:${userId}`;
  }

  static rateLimitMessages(userId: string): string {
    return `rate_limit:${userId}:messages`;
  }

  static rateLimitEvents(socketId: string): string {
    return `rate_limit:socket:${socketId}:events`;
  }

  // ============ FRIENDSHIP KEYS ============

  /**
   * Pending friend requests for a user
   * Used by: FriendshipService
   * Pattern: `FRIENDSHIP:PENDING_REQUESTS:{userId}`
   */
  static friendshipPendingRequests(userId: string): string {
    return `${this.DOMAIN_FRIENDSHIP}:PENDING_REQUESTS:${userId}`;
  }

  /**
   * Friend list for a user
   * Used by: FriendshipService
   * Pattern: `FRIENDSHIP:FRIENDS:{userId}`
   */
  static friendshipFriendsList(userId: string): string {
    return `${this.DOMAIN_FRIENDSHIP}:FRIENDS:${userId}`;
  }

  /**
   * Sent requests for a user (requests they initiated)
   * Used by: FriendshipService
   * Pattern: `FRIENDSHIP:SENT_REQUESTS:{userId}`
   */
  static friendshipSentRequests(userId: string): string {
    return `${this.DOMAIN_FRIENDSHIP}:SENT_REQUESTS:${userId}`;
  }

  /**
   * Friend suggestion list for a user
   * Used by: FriendshipService
   * Pattern: `FRIENDSHIP:SUGGESTIONS:{userId}`
   */
  static friendshipSuggestions(userId: string): string {
    return `${this.DOMAIN_FRIENDSHIP}:SUGGESTIONS:${userId}`;
  }

  /**
   * Mutual friends between two users
   * Used by: FriendshipService
   * Pattern: `FRIENDSHIP:MUTUAL_FRIENDS:{userId1}:{userId2}`
   */
  static friendshipMutualFriends(userId1: string, userId2: string): string {
    const [id1, id2] = [userId1, userId2].sort();
    return `${this.DOMAIN_FRIENDSHIP}:MUTUAL_FRIENDS:${id1}:${id2}`;
  }

  /**
   * Friendship relationship status
   * Used by: FriendshipService
   * Pattern: `FRIENDSHIP:STATUS:{userId1}:{userId2}`
   */
  static friendshipStatus(userId1: string, userId2: string): string {
    const [id1, id2] = [userId1, userId2].sort();
    return `${this.DOMAIN_FRIENDSHIP}:STATUS:${id1}:${id2}`;
  }

  /**
   * Friend request details
   * Used by: FriendshipService
   * Pattern: `FRIENDSHIP:REQUEST:{requestId}`
   */
  static friendshipRequest(requestId: string): string {
    return `${this.DOMAIN_FRIENDSHIP}:REQUEST:${requestId}`;
  }

  /**
   * Distributed lock for friendship operations
   * Used by: FriendshipService for atomic mutations
   * Pattern: `FRIENDSHIP:LOCK:{userId1}:{userId2}` or `FRIENDSHIP:LOCK:{id}`
   */
  static friendshipLock(userId1: string, userId2: string = ''): string {
    if (!userId2) {
      // Single ID version (for single-user operations)
      return `${this.DOMAIN_FRIENDSHIP}:LOCK:${userId1}`;
    }
    const [id1, id2] = [userId1, userId2].sort();
    return `${this.DOMAIN_FRIENDSHIP}:LOCK:${id1}:${id2}`;
  }

  // ============ BLOCK KEYS ============

  /**
   * Blocked users for a user
   * Pattern: `BLOCK:BLOCKED_USERS:{userId}`
   */
  static blockBlockedUsers(userId: string): string {
    return `${this.DOMAIN_BLOCK}:BLOCKED_USERS:${userId}`;
  }

  /**
   * Users who blocked a user
   * Pattern: `BLOCK:BLOCKED_BY:{userId}`
   */
  static blockBlockedBy(userId: string): string {
    return `${this.DOMAIN_BLOCK}:BLOCKED_BY:${userId}`;
  }

  /**
   * Distributed lock for block operations
   * Pattern: `BLOCK:LOCK:{userId1}:{userId2}`
   */
  static blockLock(userId1: string, userId2: string): string {
    const [id1, id2] = [userId1, userId2].sort();
    return `${this.DOMAIN_BLOCK}:LOCK:${id1}:${id2}`;
  }

  // ============ MESSAGING KEYS ============

  /**
   * Conversations for a user
   * Pattern: `MESSAGING:CONVERSATIONS:{userId}`
   */
  static messagingConversations(userId: string): string {
    return `${this.DOMAIN_MESSAGING}:CONVERSATIONS:${userId}`;
  }

  /**
   * Messages in a conversation
   * Pattern: `MESSAGING:MESSAGES:{conversationId}`
   */
  static messagingMessages(conversationId: string): string {
    return `${this.DOMAIN_MESSAGING}:MESSAGES:${conversationId}`;
  }

  /**
   * Conversation metadata
   * Pattern: `MESSAGING:CONVERSATION:{conversationId}`
   */
  static messagingConversationMetadata(conversationId: string): string {
    return `${this.DOMAIN_MESSAGING}:CONVERSATION:${conversationId}`;
  }

  /**
   * Distributed lock for conversation operations
   * Pattern: `MESSAGING:LOCK:{conversationId}`
   */
  static messagingLock(conversationId: string): string {
    return `${this.DOMAIN_MESSAGING}:LOCK:${conversationId}`;
  }

  // ============ CALL KEYS ============

  /**
   * Call history for a user
   * Pattern: `CALL:HISTORY:{userId}`
   */
  static callHistory(userId: string): string {
    return `${this.DOMAIN_CALL}:HISTORY:${userId}`;
  }

  /**
   * Active calls
   * Pattern: `CALL:ACTIVE_CALLS:{callId}`
   */
  static callActive(callId: string): string {
    return `${this.DOMAIN_CALL}:ACTIVE_CALLS:${callId}`;
  }

  /**
   * Distributed lock for call operations
   * Pattern: `CALL:LOCK:{callId}`
   */
  static callLock(callId: string): string {
    return `${this.DOMAIN_CALL}:LOCK:${callId}`;
  }

  // ============ SOCIAL/FRIENDSHIP DOMAIN KEYS (backward compatibility) ============

  /**
   * Friend count for a user
   * Pattern: `SOCIAL:FRIEND_COUNT:{userId}` or `SOCIAL:FRIEND_COUNT:{userId}:{status}`
   */
  static socialFriendCount(userId: string, status?: string): string {
    if (status) {
      return `${this.DOMAIN_SOCIAL}:FRIEND_COUNT:${userId}:${status}`;
    }
    return `${this.DOMAIN_SOCIAL}:FRIEND_COUNT:${userId}`;
  }

  /**
   * Pattern for all friend count keys of a user (for invalidation)
   * Matches: SOCIAL:FRIEND_COUNT:{userId} and SOCIAL:FRIEND_COUNT:{userId}:*
   */
  static socialFriendCountPattern(userId: string): string {
    return `${this.DOMAIN_SOCIAL}:FRIEND_COUNT:${userId}*`;
  }

  /**
   * Friendship relationship (backward compatibility)
   * Pattern: `SOCIAL:FRIENDSHIP:{userId1}:{userId2}`
   */
  static socialFriendship(userId1: string, userId2: string): string {
    const [id1, id2] = [userId1, userId2].sort();
    return `${this.DOMAIN_SOCIAL}:FRIENDSHIP:${id1}:${id2}`;
  }

  /**
   * Block status cache (backward compatibility)
   * Pattern: `SOCIAL:BLOCK:{userId1}:{userId2}`
   */
  static socialBlock(userId1: string, userId2: string): string {
    const [id1, id2] = [userId1, userId2].sort();
    return `${this.DOMAIN_SOCIAL}:BLOCK:${id1}:${id2}`;
  }

  /**
   * Permission check for interaction (message, call, profile)
   * Pattern: `SOCIAL:PERMISSION:{type}:{id1}:{id2}` (ids sorted for consistency)
   */
  static socialPermission(
    type: PermissionActionType,
    userId1: string,
    userId2: string,
  ): string {
    const [id1, id2] = [userId1, userId2].sort();
    return `${this.DOMAIN_SOCIAL}:PERMISSION:${type}:${id1}:${id2}`;
  }

  /**
   * Privacy settings cache
   * Pattern: `SOCIAL:PRIVACY:{userId}`
   */
  static socialPrivacy(userId: string): string {
    return `${this.DOMAIN_SOCIAL}:PRIVACY:${userId}`;
  }

  /**
   * Redis patterns for permission cache invalidation (all keys involving userId)
   * Use with RedisService.deletePattern() for each pattern
   * Pattern: `SOCIAL:PERMISSION:{type}:{userId}:*` and `SOCIAL:PERMISSION:{type}:*:{userId}`
   */
  static socialPermissionPatternsForUser(
    action: PermissionActionType,
    userId: string,
  ): [string, string] {
    return [
      `${this.DOMAIN_SOCIAL}:PERMISSION:${action}:${userId}:*`,
      `${this.DOMAIN_SOCIAL}:PERMISSION:${action}:*:${userId}`,
    ];
  }

  // ============ RATE LIMIT KEYS ============

  /**
   * Rate limit for friend requests
   * Pattern: `RATELIMIT:FRIEND_REQUEST:{userId}:{period}`
   */
  static rateLimitFriendRequest(
    userId: string,
    period: 'daily' | 'weekly',
  ): string {
    return `${this.DOMAIN_RATELIMIT}:FRIEND_REQUEST:${userId}:${period}`;
  }

  // ============ PATTERN METHODS (for wildcard deletion) ============

  // ============ NOTIFICATION KEYS ============

  /**
   * Notification batch counter + state (Redis hash).
   * Used by: NotificationBatchService for anti-spam time-window batching.
   * Pattern: `NOTIFICATION:BATCH:{recipientId}:{conversationId}`
   * TTL: batch window seconds (5-10s) — auto-cleanup.
   */
  static notificationBatch(
    recipientId: string,
    conversationId: string,
  ): string {
    return `${this.DOMAIN_NOTIFICATION}:BATCH:${recipientId}:${conversationId}`;
  }

  /**
   * Conversation member cache for notification decisions.
   * Caches { userId, isMuted, isArchived, role } for all members.
   * Used by: MessageNotificationListener to avoid DB query per message event.
   * Pattern: `NOTIFICATION:CONV_MEMBERS:{conversationId}`
   * TTL: 5 minutes (invalidated on member change events).
   */
  static notificationConvMembers(conversationId: string): string {
    return `${this.DOMAIN_NOTIFICATION}:CONV_MEMBERS:${conversationId}`;
  }

  // ============ PATTERN METHODS (for wildcard deletion) ============

  /**
   * Get pattern for all friendship-related keys for a user
   * Pattern: `FRIENDSHIP:*:{userId}`
   */
  static friendshipUserPattern(userId: string): string {
    return `${this.DOMAIN_FRIENDSHIP}:*:${userId}`;
  }

  /**
   * Get pattern for all block-related keys for a user
   * Pattern: `BLOCK:*:{userId}`
   */
  static blockUserPattern(userId: string): string {
    return `${this.DOMAIN_BLOCK}:*:${userId}`;
  }

  /**
   * Get pattern for all messaging keys for a user
   * Pattern: `MESSAGING:*:{userId}*`
   */
  static messagingUserPattern(userId: string): string {
    return `${this.DOMAIN_MESSAGING}:*:*${userId}*`;
  }

  /**
   * Get pattern for all keys in a domain
   * Pattern: `{domain}:*`
   */
  static domainPattern(domain: string): string {
    return `${domain}:*`;
  }

  /**
   * Validate Redis key format
   * Ensures key matches expected pattern
   */
  static isValidKey(key: string): boolean {
    // Key should contain at least one colon separator
    // and should not be empty
    return typeof key === 'string' && key.includes(':') && key.length > 0;
  }

  /**
   * Extract domain from key
   */
  static extractDomain(key: string): string | null {
    const parts = key.split(':');
    return parts[0] || null;
  }

  /**
   * Extract entity type from key
   */
  static extractEntity(key: string): string | null {
    const parts = key.split(':');
    return parts[1] || null;
  }

  /**
   * Extract ID from key
   */
  static extractId(key: string): string | null {
    const parts = key.split(':');
    return parts[2] || null;
  }
}
