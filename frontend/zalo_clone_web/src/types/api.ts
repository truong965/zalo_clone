/**
 * Global API Response Types từ NestJS Backend
 * Sync từ Prisma Schema
 */

// ============================================================================
// 1. ENUMS
// ============================================================================

// --- User & Identity ---
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

// --- Privacy & Social ---
export enum PrivacyLevel {
  EVERYONE = 'EVERYONE',
  CONTACTS = 'CONTACTS',
}

export enum FriendshipStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}

// --- Messaging & Group ---
export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
}

export enum MemberRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum MemberStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  KICKED = 'KICKED',
  LEFT = 'LEFT',
}

export enum JoinRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  FILE = 'FILE',
  STICKER = 'STICKER',
  SYSTEM = 'SYSTEM',
  AUDIO = 'AUDIO',
  VOICE = 'VOICE',
}

export enum ReceiptStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  SEEN = 'SEEN',
}

// --- Media ---
export enum MediaType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
  AUDIO = 'AUDIO',
}

export enum MediaProcessingStatus {
  PENDING = 'PENDING',
  UPLOADED = 'UPLOADED',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

// --- Call ---
export enum CallStatus {
  COMPLETED = 'COMPLETED',
  MISSED = 'MISSED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

// --- Device & Security ---
export enum DeviceType {
  WEB = 'WEB',
  MOBILE = 'MOBILE',
  DESKTOP = 'DESKTOP',
}

export enum Platform {
  IOS = 'IOS',
  ANDROID = 'ANDROID',
  WEB = 'WEB',
  WINDOWS = 'WINDOWS',
  MACOS = 'MACOS',
  LINUX = 'LINUX',
}

export enum TokenRevocationReason {
  MANUAL_LOGOUT = 'MANUAL_LOGOUT',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  TOKEN_ROTATION = 'TOKEN_ROTATION',
  ADMIN_ACTION = 'ADMIN_ACTION',
}

// --- Events ---
export enum EventType {
  // Block Domain
  USER_BLOCKED = 'USER_BLOCKED',
  USER_UNBLOCKED = 'USER_UNBLOCKED',

  // Social Domain
  FRIEND_REQUEST_SENT = 'FRIEND_REQUEST_SENT',
  FRIEND_REQUEST_ACCEPTED = 'FRIEND_REQUEST_ACCEPTED',
  FRIEND_REQUEST_REJECTED = 'FRIEND_REQUEST_REJECTED',
  FRIEND_REQUEST_CANCELLED = 'FRIEND_REQUEST_CANCELLED',
  UNFRIENDED = 'UNFRIENDED',

  // Messaging Domain
  MESSAGE_SENT = 'MESSAGE_SENT',
  CONVERSATION_CREATED = 'CONVERSATION_CREATED',
  CONVERSATION_MEMBER_ADDED = 'CONVERSATION_MEMBER_ADDED',
  CONVERSATION_MEMBER_LEFT = 'CONVERSATION_MEMBER_LEFT',
  CONVERSATION_MEMBER_PROMOTED = 'CONVERSATION_MEMBER_PROMOTED',
  CONVERSATION_MEMBER_DEMOTED = 'CONVERSATION_MEMBER_DEMOTED',
  GROUP_CREATED = 'GROUP_CREATED',
  MESSAGE_DELIVERED = 'MESSAGE_DELIVERED',
  MESSAGE_SEEN = 'MESSAGE_SEEN',

  // Call Domain
  CALL_INITIATED = 'CALL_INITIATED',
  CALL_ANSWERED = 'CALL_ANSWERED',
  CALL_ENDED = 'CALL_ENDED',
  CALL_REJECTED = 'CALL_REJECTED',

  // Auth Domain
  USER_REGISTERED = 'USER_REGISTERED',
  USER_PROFILE_UPDATED = 'USER_PROFILE_UPDATED',

  // Presence Domain
  USER_WENT_ONLINE = 'USER_WENT_ONLINE',
  USER_WENT_OFFLINE = 'USER_WENT_OFFLINE',

  // Privacy Domain
  PRIVACY_SETTINGS_UPDATED = 'PRIVACY_SETTINGS_UPDATED',

  // Contact Domain
  CONTACT_SYNCED = 'CONTACT_SYNCED',
  CONTACT_ADDED = 'CONTACT_ADDED',
  CONTACT_REMOVED = 'CONTACT_REMOVED',

  // Notifications Domain
  NOTIFICATION_SENT = 'NOTIFICATION_SENT',

  // Media Domain
  MEDIA_UPLOADED = 'MEDIA_UPLOADED',
  MEDIA_DELETED = 'MEDIA_DELETED',
}

// ============================================================================
// 2. RESPONSE WRAPPERS
// ============================================================================

// Generic API Response
export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
}

// Error Response
export interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}

// ============================================================================
// 3. PAGINATION RESPONSES
// ============================================================================

// Cursor-based Pagination (Infinity Scroll)
export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: {
    limit: number;
    hasNextPage: boolean;
    nextCursor?: string;
    total?: number;
  };
}

// Offset-based Pagination (Table/Grid)
export interface PagePaginatedResponse<T> {
  data: T[];
  meta: {
    current: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ============================================================================
// 4. IAM MODULE (USER, AUTH, RBAC)
// ============================================================================

export interface User {
  id: string;
  phoneNumber: string;
  phoneCode: string;
  phoneNumberHash?: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  dateOfBirth?: string;
  gender?: Gender;
  status: UserStatus;
  passwordHash?: string;
  passwordVersion?: number;
  lastSeenAt?: string;
  roleId?: string;

  role?: string;
  permissions?: Permission[];

  createdById?: string;
  updatedById?: string;
  deletedById?: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface UserToken {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceId: string;
  deviceName?: string;
  deviceType?: DeviceType;
  platform?: Platform;
  ipAddress?: string;
  userAgent?: string;
  issuedAt: string;
  expiresAt: string;
  lastUsedAt: string;
  isRevoked: boolean;
  revokedAt?: string;
  revokedReason?: TokenRevocationReason;
  parentTokenId?: string;
}

export interface UserDevice {
  id: string;
  userId: string;
  deviceId: string;
  fcmToken?: string;
  platform?: string;
  lastActiveAt: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  createdById?: string;
  updatedById?: string;
  deletedById?: string;
}

export interface Permission {
  id: string;
  name: string;
  apiPath: string;
  method: string;
  module: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  createdById?: string;
  updatedById?: string;
  deletedById?: string;
}

export interface PrivacySettings {
  userId: string;
  showProfile: PrivacyLevel;
  whoCanMessageMe: PrivacyLevel;
  whoCanCallMe: PrivacyLevel;
  showOnlineStatus: boolean;
  showLastSeen: boolean;
  createdAt: string;
  updatedAt: string;
  updatedById?: string;
}

// ============================================================================
// 5. SOCIAL GRAPH MODULE
// ============================================================================

export interface Friendship {
  id: string;
  user1Id: string;
  user2Id: string;
  requesterId: string;
  status: FriendshipStatus;
  acceptedAt?: string;
  declinedAt?: string;
  expiresAt?: string;
  lastActionAt?: string;
  lastActionBy?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Block {
  id: string;
  blockerId: string;
  blockedId: string;
  reason?: string;
  createdAt: string;
}

export interface UserContact {
  id: string;
  ownerId: string;
  contactUserId: string;
  aliasName?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 6. MESSAGING MODULE
// ============================================================================

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  avatarUrl?: string;
  lastMessageAt?: string;
  participants: string[];
  requireApproval: boolean;
  settings: Record<string, any>;
  createdById?: string;
  updatedById?: string;
  deletedById?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ConversationMember {
  conversationId: string;
  userId: string;
  role: MemberRole;
  status: MemberStatus;
  promotedBy?: string;
  promotedAt?: string;
  demotedBy?: string;
  demotedAt?: string;
  lastReadMessageId?: string;
  lastReadAt?: string;
  unreadCount: number;
  joinedAt: string;
  leftAt?: string;
  kickedBy?: string;
  kickedAt?: string;
}

export interface GroupJoinRequest {
  id: string;
  conversationId: string;
  userId: string;
  status: JoinRequestStatus;
  inviterId?: string;
  requestedAt: string;
  expiresAt?: string;
  message?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface Message {
  id: number;
  conversationId: string;
  senderId?: string;
  type: MessageType;
  content?: string;
  metadata?: Record<string, any>;
  replyToId?: number;
  clientMessageId?: string;
  updatedById?: string;
  deletedById?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface MessageReceipt {
  messageId: number;
  userId: string;
  status: ReceiptStatus;
  timestamp: string;
}

// ============================================================================
// 7. MEDIA MODULE
// ============================================================================

export interface MediaAttachment {
  id: string;
  messageId?: number;
  originalName: string;
  mimeType: string;
  mediaType: MediaType;
  size: number;
  s3Key?: string;
  s3Bucket: string;
  cdnUrl?: string;
  thumbnailUrl?: string;
  thumbnailS3Key?: string;
  optimizedUrl?: string;
  hlsPlaylistUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
  processingStatus: MediaProcessingStatus;
  processingError?: string;
  processedAt?: string;
  uploadId?: string;
  s3KeyTemp?: string;
  retryCount: number;
  uploadedBy: string;
  uploadedFrom?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  deletedById?: string;
}

// ============================================================================
// 8. CALL MODULE
// ============================================================================

export interface CallHistory {
  id: string;
  callerId: string;
  calleeId: string;
  duration?: number;
  status: CallStatus;
  startedAt: string;
  endedAt?: string;
  createdAt: string;
  deletedAt?: string;
}

// ============================================================================
// 9. SYSTEM & LOGGING MODULE
// ============================================================================

export interface SocketConnection {
  id: string;
  userId: string;
  socketId: string;
  deviceId: string;
  serverInstance?: string;
  ipAddress: string;
  userAgent?: string;
  connectedAt: string;
  disconnectedAt?: string;
  disconnectReason?: string;
  messagesSent: number;
  messagesReceived: number;
  duration?: number;
}

export interface DomainEvent {
  id: string;
  eventId: string;
  eventType: EventType;
  aggregateId: string;
  aggregateType: string;
  version: number;
  source: string;
  correlationId?: string;
  causationId?: string;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
  occurredAt: string;
  createdAt: string;
  issuedBy?: string;
}

export interface ProcessedEvent {
  id: string;
  eventId: string;
  eventType: EventType;
  eventVersion: number;
  handlerId: string;
  processedAt: string;
  status: string;
  errorMessage?: string;
  retryCount: number;
  correlationId?: string;
}

// ============================================================================
// 10. REQUEST/RESPONSE DTOs
// ============================================================================

// Auth
export interface LoginRequest {
  phoneNumber: string;
  password: string;
}

export interface RegisterRequest {
  displayName: string;
  phoneNumber: string;
  password: string;
  gender?: Gender;
  dateOfBirth?: Date;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// Pagination Requests
export interface CursorPaginationRequest {
  limit?: number;
  cursor?: string;
}

export interface PagePaginationRequest {
  page?: number;
  pageSize?: number;
}
