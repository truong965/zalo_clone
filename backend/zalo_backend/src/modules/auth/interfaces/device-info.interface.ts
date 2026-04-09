import { DeviceType, Platform } from '@prisma/client';

export interface DeviceInfo {
  deviceId: string; // Unique fingerprint
  deviceName: string; // "iPhone 14 Pro", "Chrome on Windows"
  deviceType: DeviceType; // WEB, MOBILE, DESKTOP
  platform: Platform; // IOS, ANDROID, WEB, etc.
  ipAddress: string;
  userAgent: string;
  
  // Extended fields parsed by ua-parser-js
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  osVersion?: string;
  
  // Location resolved by GeoIP
  location?: string;
}
