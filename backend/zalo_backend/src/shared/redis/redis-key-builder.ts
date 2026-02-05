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

  static callUserActiveCalls(userId: string): string {
    return `call:user:${userId}:active`;
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
