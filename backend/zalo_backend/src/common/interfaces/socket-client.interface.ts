import { Socket } from 'socket.io';
import { User } from '@prisma/client';

/**
 * Lightweight User Context for Socket
 * Chỉ chứa thông tin cần thiết để định danh và phân quyền
 */
export interface SocketUserContext {
  id: string;
  phoneNumber: string;
  displayName: string;
  avatarUrl: string | null;
  roleId: string | null;
  status: string;
  passwordVersion: number;
}
/**
 * Extended Socket interface with user context
 */
export interface AuthenticatedSocket extends Socket {
  user?: SocketUserContext;
  userId?: string;
  deviceId?: string;
  authenticated?: boolean;
  _cleanupTimers?: Array<NodeJS.Timeout>; // Chuẩn bị sẵn cho Task 2
}

/**
 * Socket connection metadata
 */
export interface SocketMetadata {
  socketId: string;
  userId: string;
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  connectedAt: Date;
  serverInstance: string;
}

/**
 * Disconnect reasons
 */
export enum DisconnectReason {
  CLIENT_DISCONNECT = 'client_disconnect',
  SERVER_SHUTDOWN = 'server_shutdown',
  TIMEOUT = 'timeout',
  AUTH_FAILED = 'auth_failed',
  TRANSPORT_ERROR = 'transport_error',
  PING_TIMEOUT = 'ping_timeout',
}
