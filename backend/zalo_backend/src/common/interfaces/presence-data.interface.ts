/**
 * User presence status
 */
export enum PresenceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  AWAY = 'away',
}

/**
 * Presence data stored in Redis
 */
export interface PresenceData {
  userId: string;
  status: PresenceStatus;
  lastSeenAt: Date;
  devices: string[]; // Array of deviceIds
}

/**
 * Presence update payload
 */
export interface PresenceUpdate {
  userId: string;
  status: PresenceStatus;
  timestamp: Date;
}

/**
 * Device presence info
 */
export interface DevicePresence {
  deviceId: string;
  socketId: string;
  connectedAt: Date;
}
