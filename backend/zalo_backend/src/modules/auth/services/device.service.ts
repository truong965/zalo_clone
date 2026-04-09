import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { DeviceInfo } from '../interfaces/device-info.interface';
import { DeviceRegistryItemDto } from '../dto/device-registry-item.dto';
import { UserDevice, DeviceType } from '@prisma/client';
import { TokenService } from './token.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QR_INTERNAL_EVENTS } from 'src/common/constants/internal-events.constant';
import { RedisRegistryService } from 'src/shared/redis/services/redis-registry.service';

@Injectable()
export class DeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisRegistry: RedisRegistryService,
  ) {}

  async upsertDevice(userId: string, deviceInfo: DeviceInfo): Promise<UserDevice> {
    return this.prisma.userDevice.upsert({
      where: {
        userId_deviceId: {
          userId,
          deviceId: deviceInfo.deviceId,
        },
      },
      create: {
        userId,
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        browserName: deviceInfo.browserName,
        browserVersion: deviceInfo.browserVersion,
        osName: deviceInfo.osName,
        osVersion: deviceInfo.osVersion,
        platform: deviceInfo.platform,
        deviceType: deviceInfo.deviceType as DeviceType,
        lastIp: deviceInfo.ipAddress,
        lastLocation: deviceInfo.location,
        isTrusted: false, // Set to true only after successful 2FA
        lastActiveAt: new Date(),
      },
      update: {
        deviceName: deviceInfo.deviceName,
        browserName: deviceInfo.browserName,
        browserVersion: deviceInfo.browserVersion,
        osName: deviceInfo.osName,
        osVersion: deviceInfo.osVersion,
        platform: deviceInfo.platform,
        deviceType: deviceInfo.deviceType as DeviceType,
        lastIp: deviceInfo.ipAddress,
        lastLocation: deviceInfo.location,
        lastActiveAt: new Date(),
      },
    });
  }

  async getDevices(userId: string): Promise<DeviceRegistryItemDto[]> {
    const devices = await this.prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
    });
    
    const activeSessions = await this.tokenService.getUserSessions(userId);
    const activeDeviceIds = new Set(activeSessions.map(s => s.deviceId));

    // Get all socket metadata to check which devices are currently connected
    const socketIds = await this.redisRegistry.getUserSockets(userId);
    const connectedDeviceIds = new Set<string>();

    for (const socketId of socketIds) {
      const metadata = await this.redisRegistry.getSocketMetadata(socketId);
      if (metadata) {
        connectedDeviceIds.add(metadata.deviceId);
      }
    }

    return devices.map((d) => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      deviceType: d.deviceType || 'UNKNOWN',
      platform: d.platform || 'UNKNOWN',
      browser: d.browserName || undefined,
      os: d.osName || undefined,
      lastIp: d.lastIp || undefined,
      lastLocation: d.lastLocation || undefined,
      isTrusted: d.isTrusted,
      trustedAt: d.trustedAt || undefined,
      lastActiveAt: d.lastActiveAt,
      registeredAt: d.createdAt,
      hasActiveSession: activeDeviceIds.has(d.deviceId),
      isOnline: connectedDeviceIds.has(d.deviceId),
    }));
  }

  async getDevice(userId: string, deviceId: string): Promise<UserDevice> {
    const device = await this.prisma.userDevice.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return device;
  }

  async isDeviceTrusted(userId: string, deviceId: string): Promise<boolean> {
    const device = await this.prisma.userDevice.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
      select: { isTrusted: true },
    });
    return device?.isTrusted ?? false;
  }

  async trustDevice(userId: string, deviceId: string): Promise<void> {
    await this.prisma.userDevice.updateMany({
      where: { userId, deviceId },
      data: { isTrusted: true, trustedAt: new Date() },
    });
  }

  async untrustDevice(userId: string, deviceId: string): Promise<void> {
    await this.prisma.userDevice.updateMany({
      where: { userId, deviceId },
      data: { isTrusted: false, trustedAt: null },
    });
  }

  async removeDevice(userId: string, deviceId: string): Promise<void> {
    // 1. Revoke session token to prevent further API calls
    await this.tokenService.revokeDeviceSession(userId, deviceId);
    
    // 2. Emit socket disconnect
    this.eventEmitter.emit(QR_INTERNAL_EVENTS.FORCE_LOGOUT_DEVICES, {
      userId,
      deviceIds: [deviceId],
      reason: 'Device permanently removed from authorized list',
    });
    
    // 3. Hard delete from registry
    await this.prisma.userDevice.delete({
      where: { userId_deviceId: { userId, deviceId } },
    });
  }

  async getTrustedDevicesForPush(userId: string) {
    return this.prisma.userDevice.findMany({
      where: {
        userId,
        isTrusted: true,
        deviceType: DeviceType.MOBILE,
        fcmToken: { not: null },
      },
      select: {
        deviceId: true,
        deviceName: true,
        fcmToken: true,
      },
    });
  }
}
