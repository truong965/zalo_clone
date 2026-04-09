import { Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { DeviceInfo } from '../interfaces/device-info.interface';
import { DeviceType, Platform } from '@prisma/client';
import { UAParser } from 'ua-parser-js';
import { GeoIpService } from './geo-ip.service';

export const DEVICE_TRACKING_COOKIE = 'device_tracking_id';
export const DEVICE_TRACKING_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 year

@Injectable()
export class DeviceFingerprintService {
  constructor(private readonly geoIpService: GeoIpService) {}

  /**
   * Generate a stable browser/device fingerprint from request headers.
   * Used for deduplication when cookies are lost.
   * Returns full 64-char SHA-256 hex string.
   */
  generateFingerprint(req: Request): string {
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const acceptEncoding = req.headers['accept-encoding'] || '';

    // Custom headers from client
    const screenResolution = req.headers['x-screen-resolution'] || '';
    const timezone = req.headers['x-timezone'] || '';
    const platform = req.headers['x-platform'] || '';

    const raw = [
      userAgent,
      acceptLanguage,
      acceptEncoding,
      screenResolution,
      timezone,
      platform,
    ].join('|');

    return crypto
      .createHash('sha256')
      .update(raw)
      .digest('hex');
  }

  /**
   * Set the device tracking cookie on the response
   */
  setTrackingCookie(res: Response, trackingId: string): void {
    res.cookie(DEVICE_TRACKING_COOKIE, trackingId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
      maxAge: DEVICE_TRACKING_MAX_AGE,
      path: '/',
    });
  }

  /**
   * Get existing tracking ID from cookie, or create and set a new one.
   */
  getOrCreateTrackingId(req: Request, res: Response): string {
    const appDeviceId = req.headers['x-device-id'] as string | undefined;
    if (appDeviceId) {
      return appDeviceId;
    }

    const existing = req.cookies?.[DEVICE_TRACKING_COOKIE] as string | undefined;

    if (existing) {
      return existing;
    }

    const trackingId = crypto.randomUUID();
    this.setTrackingCookie(res, trackingId);

    return trackingId;
  }

  /**
   * Extract detailed device information from request using ua-parser-js and GeoIP
   */
  extractDeviceInfo(req: Request): DeviceInfo {
    const appDeviceId = req.headers['x-device-id'] as string | undefined;
    const trackingId = req.cookies?.[DEVICE_TRACKING_COOKIE] as string | undefined;
    const deviceId = appDeviceId || trackingId || crypto.randomUUID();

    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ipAddress = this.extractIpAddress(req);
    
    // Parse User-Agent
    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();

    const browserName = browser.name;
    const browserVersion = browser.version;
    
    // Mobile OS headers take priority over UA parsing (React Native UA is unreliable)
    const headerOsName = req.headers['x-os-name'] as string | undefined;
    const headerOsVersion = req.headers['x-os-version'] as string | undefined;
    const osName = headerOsName || os.name;
    const osVersion = headerOsVersion || os.version;
    
    // Fallbacks and smart defaults
    const headerDeviceType = req.headers['x-device-type'] as string;
    const headerPlatform = req.headers['x-platform'] as string;
    const headerDeviceName = req.headers['x-device-name'] as string;

    const deviceType = this.parseDeviceType(headerDeviceType, device.type);
    const platform = this.parsePlatform(headerPlatform, os.name);
    
    // Determine the best display name ("Chrome 122 on Windows 11" or custom App name)
    let defaultDeviceName = 'Unknown Device';
    if (headerDeviceName && headerDeviceName !== 'Unknown Device' && headerDeviceName !== 'Web App' && headerDeviceName !== 'Android App' && headerDeviceName !== 'iOS App') {
      defaultDeviceName = headerDeviceName; // App explicitly sent a good model name
    } else if (browserName && osName) {
      defaultDeviceName = `${browserName} on ${osName}`;
    } else if (osName) {
      defaultDeviceName = osName;
    } else if (browserName) {
      defaultDeviceName = browserName;
    }

    const deviceName = headerDeviceName || defaultDeviceName;

    // Resolve location
    const locationInfo = this.geoIpService.lookupIp(ipAddress);
    
    // Generate browser fingerprint for deduplication
    const fingerprint = this.generateFingerprint(req);

    // Phase 2: Extract device identity keys
    const publicKey = req.headers['x-public-key'] as string | undefined;
    const keyAlgorithm = req.headers['x-key-algorithm'] as string | undefined;

    return {
      deviceId,
      deviceName,
      deviceType,
      platform,
      ipAddress,
      userAgent,
      browserName,
      browserVersion,
      osName,
      osVersion,
      location: locationInfo.fullLocation,
      fingerprint,
      publicKey,
      keyAlgorithm,
    };
  }

  private parseDeviceType(headerVal?: string, uaDeviceType?: string): DeviceType {
    if (headerVal && headerVal.toUpperCase() in DeviceType) {
      return headerVal.toUpperCase() as DeviceType;
    }
    if (uaDeviceType === 'mobile' || uaDeviceType === 'tablet') {
      return DeviceType.MOBILE;
    }
    return DeviceType.WEB;
  }

  private parsePlatform(headerVal?: string, osName?: string): Platform {
    if (headerVal && headerVal.toUpperCase() in Platform) {
      return headerVal.toUpperCase() as Platform;
    }
    
    if (!osName) return Platform.WEB;
    
    const osLower = osName.toLowerCase();
    if (osLower.includes('ios')) return Platform.IOS;
    if (osLower.includes('android')) return Platform.ANDROID;
    if (osLower.includes('windows')) return Platform.WINDOWS;
    if (osLower.includes('mac os')) return Platform.MACOS;
    if (osLower.includes('linux')) return Platform.LINUX;
    
    return Platform.WEB;
  }

  private extractIpAddress(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
      return ips[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return typeof realIp === 'string' ? realIp : realIp[0];
    }

    return req.ip || req.socket.remoteAddress || 'Unknown';
  }
}

