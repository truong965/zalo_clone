/**
 * Global API Response Types từ NestJS Backend
 */

// Generic API Response
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

// Pagination
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Error Response
export interface ErrorResponse {
  success: false;
  message: string;
  error?: string;
  statusCode: number;
}

// User
export interface User {
  id: string;
  email: string;
  phoneNumber?: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  bio?: string;
  isOnline: boolean;
  lastSeen?: string;
  createdAt: string;
  updatedAt: string;
}

// Message
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  media?: MediaFile[];
  replyTo?: Message;
  createdAt: string;
  updatedAt: string;
  isRead: boolean;
  readAt?: string;
}

export interface MediaFile {
  id: string;
  url: string;
  type: 'image' | 'video' | 'file' | 'audio';
  size: number;
  name: string;
}

// Conversation (Chat Room)
export interface Conversation {
  id: string;
  participantIds: string[];
  participants: User[];
  lastMessage?: Message;
  createdAt: string;
  updatedAt: string;
  isGroup: boolean;
  name?: string; // For group chats
  avatar?: string; // For group chats
}

// Friend
export interface Friend {
  id: string;
  userId: string;
  friendId: string;
  friend: User;
  status: 'pending' | 'accepted' | 'blocked';
  createdAt: string;
  acceptedAt?: string;
}

// Block
export interface Block {
  id: string;
  blockerId: string;
  blockedId: string;
  blocked: User;
  createdAt: string;
}

// Notification
export interface Notification {
  id: string;
  userId: string;
  type: 'message' | 'friend_request' | 'call' | 'system';
  title: string;
  message: string;
  relatedId?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

// Call
export interface Call {
  id: string;
  callerId: string;
  receiverId: string;
  type: 'audio' | 'video';
  status: 'pending' | 'accepted' | 'rejected' | 'ended';
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Auth
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
