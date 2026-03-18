export const REQUEST_CONTEXT_KEYS = {
  REQUEST_ID: 'requestId',
  USER_ID: 'userId',
  SESSION_ID: 'sessionId',
  DEVICE_ID: 'deviceId',
  ROLES: 'roles',
} as const;

export interface RequestContextStore {
  [key: symbol]: unknown;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  deviceId?: string;
  roles?: string[];
}

export interface AuthenticatedRequestContext {
  userId: string;
  roles?: unknown;
  sessionId?: string;
  deviceId?: string;
}