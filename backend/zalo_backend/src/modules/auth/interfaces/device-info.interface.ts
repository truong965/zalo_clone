import { DeviceType, Platform } from '@prisma/client';

export interface DeviceInfo {
  deviceId: string; // Unique fingerprint
  deviceName: string; // "iPhone 14 Pro", "Chrome on Windows"
  deviceType: DeviceType; // WEB, MOBILE, DESKTOP
  platform: Platform; // IOS, ANDROID, WEB, etc.
  ipAddress: string;
  userAgent: string;
}
