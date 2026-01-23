import { Socket } from 'socket.io';
import { User } from '@prisma/client';

/**
 * Extended Socket interface with user context
 */
export interface AuthenticatedSocket extends Socket {
  user?: User;
  userId?: string;
  deviceId?: string;
  authenticated?: boolean;
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
