import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import { DeviceInfo } from '../interfaces/device-info.interface';
import { DeviceType, Platform } from '@prisma/client';

@Injectable()
export class DeviceFingerprintService {
  /**
   * Safe header extraction
   */
  /**
   * Generate unique device ID from request fingerprint
   * Client should send these headers:
   * - X-Device-Name: Device name (e.g., "iPhone 14 Pro")
   * - X-Device-Type: WEB | MOBILE | DESKTOP
   * - X-Platform: IOS | ANDROID | WEB | WINDOWS | MACOS | LINUX
   * - X-Screen-Resolution: Screen resolution (e.g., "1920x1080")
   * - X-Timezone: Timezone offset (e.g., "+07:00")
   */
  generateDeviceId(req: Request): string {
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const acceptEncoding = req.headers['accept-encoding'] || '';

    // Custom headers from client
    const screenResolution = req.headers['x-screen-resolution'] || '';
    const timezone = req.headers['x-timezone'] || '';
    const platform = req.headers['x-platform'] || '';

    const fingerprint = [
      userAgent,
      acceptLanguage,
      acceptEncoding,
      screenResolution,
      timezone,
      platform,
    ].join('|');

    return crypto
      .createHash('sha256')
      .update(fingerprint)
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Extract device information from request
   */
  extractDeviceInfo(req: Request): DeviceInfo {
    const deviceId = this.generateDeviceId(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ipAddress = this.extractIpAddress(req);

    // Client-provided device info (fallback to parsed values)
    const deviceName =
      (req.headers['x-device-name'] as string) ||
      this.parseDeviceName(userAgent);
    const deviceType = this.parseDeviceType(
      req.headers['x-device-type'] as string,
      userAgent,
    );
    const platform = this.parsePlatform(
      req.headers['x-platform'] as string,
      userAgent,
    );

    return {
      deviceId,
      deviceName,
      deviceType,
      platform,
      ipAddress,
      userAgent,
    };
  }

  /**
   * Parse device name from User-Agent
   */
  private parseDeviceName(userAgent: string): string {
    // Mobile devices
    if (/iPhone/.test(userAgent)) {
      const match = userAgent.match(/iPhone OS (\d+_\d+)/);
      return match ? `iPhone (iOS ${match[1].replace('_', '.')})` : 'iPhone';
    }
    if (/iPad/.test(userAgent)) return 'iPad';
    if (/Android/.test(userAgent)) {
      const match = userAgent.match(/Android (\d+\.\d+)/);
      return match ? `Android ${match[1]}` : 'Android Device';
    }

    // Desktop browsers
    if (/Chrome/.test(userAgent)) return 'Chrome Browser';
    if (/Firefox/.test(userAgent)) return 'Firefox Browser';
    if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent))
      return 'Safari Browser';
    if (/Edge/.test(userAgent)) return 'Edge Browser';

    return 'Unknown Device';
  }

  /**
   * Parse device type from header or User-Agent
   */
  private parseDeviceType(
    header: string | undefined,
    userAgent: string,
  ): DeviceType {
    if (header) {
      const normalized = header.toUpperCase();
      if (normalized in DeviceType) return normalized as DeviceType;
    }

    if (/Mobile|Android|iPhone|iPad/.test(userAgent)) return DeviceType.MOBILE;
    if (/Windows|Macintosh|Linux/.test(userAgent)) return DeviceType.WEB;

    return DeviceType.WEB;
  }

  /**
   * Parse platform from header or User-Agent
   */
  private parsePlatform(
    header: string | undefined,
    userAgent: string,
  ): Platform {
    if (header) {
      const normalized = header.toUpperCase();
      if (normalized in Platform) return normalized as Platform;
    }

    if (/iPhone|iPad/.test(userAgent)) return Platform.IOS;
    if (/Android/.test(userAgent)) return Platform.ANDROID;
    if (/Windows/.test(userAgent)) return Platform.WINDOWS;
    if (/Macintosh/.test(userAgent)) return Platform.MACOS;
    if (/Linux/.test(userAgent)) return Platform.LINUX;

    return Platform.WEB;
  }

  /**
   * Extract IP address from request (supports proxy headers)
   */
  private extractIpAddress(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = (
        typeof forwarded === 'string' ? forwarded : forwarded[0]
      ).split(',');
      return ips[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return typeof realIp === 'string' ? realIp : realIp[0];
    }

    return req.ip || req.socket.remoteAddress || 'Unknown';
  }
}
