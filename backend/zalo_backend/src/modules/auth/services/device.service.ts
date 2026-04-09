import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { DeviceInfo } from '../interfaces/device-info.interface';
import { DeviceRegistryItemDto } from '../dto/device-registry-item.dto';
import { UserDevice, DeviceType } from '@prisma/client';
import { TokenService } from './token.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QR_INTERNAL_EVENTS } from 'src/common/constants/internal-events.constant';
import { RedisRegistryService } from 'src/shared/redis/services/redis-registry.service';
import { RedisService } from 'src/shared/redis/redis.service';
import { RedisKeyBuilder } from 'src/shared/redis/redis-key-builder';
import * as crypto from 'crypto';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisRegistry: RedisRegistryService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Register or update a device with fingerprint-based deduplication.
   */
  async upsertDevice(userId: string, deviceInfo: DeviceInfo): Promise<UserDevice> {
    const updateData: any = {
      deviceName: deviceInfo.deviceName,
      browserName: deviceInfo.browserName,
      browserVersion: deviceInfo.browserVersion,
      osName: deviceInfo.osName,
      osVersion: deviceInfo.osVersion,
      platform: deviceInfo.platform,
      deviceType: deviceInfo.deviceType as DeviceType,
      lastIp: deviceInfo.ipAddress,
      lastLocation: deviceInfo.location,
      fingerprint: deviceInfo.fingerprint,
      publicKey: deviceInfo.publicKey,
      keyAlgorithm: deviceInfo.keyAlgorithm,
      lastActiveAt: new Date(),
    };

    const existing = await this.prisma.userDevice.findUnique({
      where: { userId_deviceId: { userId, deviceId: deviceInfo.deviceId } },
    });

    if (existing) {
      return this.prisma.userDevice.update({
        where: { id: existing.id },
        data: updateData,
      });
    }

    if (deviceInfo.fingerprint) {
      const fingerprintMatch = await this.prisma.userDevice.findFirst({
        where: {
          userId,
          fingerprint: deviceInfo.fingerprint,
          deviceType: deviceInfo.deviceType as DeviceType,
        },
        orderBy: { lastActiveAt: 'desc' },
      });

      if (fingerprintMatch) {
        return this.prisma.userDevice.update({
          where: { id: fingerprintMatch.id },
          data: {
            deviceId: deviceInfo.deviceId,
            ...updateData,
          },
        });
      }
    }

    return this.prisma.userDevice.create({
      data: {
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
        fingerprint: deviceInfo.fingerprint,
        publicKey: deviceInfo.publicKey,
        keyAlgorithm: deviceInfo.keyAlgorithm,
        isTrusted: false,
        lastActiveAt: new Date(),
        ...(deviceInfo.publicKey ? {
          registeredAt: new Date(),
          registrationIp: deviceInfo.ipAddress,
        } : {}),
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
      browserName: d.browserName || undefined,
      browserVersion: d.browserVersion || undefined,
      osName: d.osName || undefined,
      osVersion: d.osVersion || undefined,
      lastIp: d.lastIp || undefined,
      lastLocation: d.lastLocation || undefined,
      isTrusted: d.isTrusted,
      trustedAt: d.trustedAt || undefined,
      lastActiveAt: d.lastActiveAt,
      registeredAt: d.registeredAt || undefined,
      hasActiveSession: activeDeviceIds.has(d.deviceId),
      isOnline: connectedDeviceIds.has(d.deviceId),
    }));
  }

  async getDevice(userId: string, deviceId: string): Promise<UserDevice> {
    const device = await this.prisma.userDevice.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });
    if (!device) throw new NotFoundException('Device not found');
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
    await this.tokenService.revokeDeviceSession(userId, deviceId);
    this.eventEmitter.emit(QR_INTERNAL_EVENTS.FORCE_LOGOUT_DEVICES, {
      userId,
      deviceIds: [deviceId],
      reason: 'Device permanently removed from authorized list',
    });
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
      select: { deviceId: true, deviceName: true, fcmToken: true },
    });
  }

  async generateAttestationChallenge(userId: string): Promise<string> {
    const challenge = crypto.randomBytes(32).toString('hex');
    const key = RedisKeyBuilder.deviceAttestChallenge(userId);
    await this.redis.setex(key, 60, challenge);
    return challenge;
  }

  /**
   * Generic ECDSA signature verification
   */
  async verifySignature(
    userId: string,
    deviceId: string,
    data: string,
    signatureHex: string,
  ): Promise<boolean> {
    try {
      const device = await this.prisma.userDevice.findUnique({
        where: { userId_deviceId: { userId, deviceId } },
      });

      if (!device || !device.publicKey) {
        this.logger.warn(`Verification failed: Device ${deviceId} has no public key stored`);
        return false;
      }

      const publicKeyBuffer = Buffer.from(device.publicKey, 'hex');
      const formattedKey = this.formatRawPublicKey(publicKeyBuffer, device.keyAlgorithm || 'secp256k1');

      const isVerified = crypto.verify(
        'SHA256',
        Buffer.from(data),
        {
          key: formattedKey,
          format: 'der',
          type: 'spki',
        },
        Buffer.from(signatureHex, 'hex'),
      );

      if (!isVerified) {
        this.logger.warn(`Signature verification FAILED for device ${deviceId}. Algorithm: ${device.keyAlgorithm}, KeyLength: ${publicKeyBuffer.length}`);
      }

      return isVerified;
    } catch (error) {
      this.logger.error(`Signature verification ERROR for device ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * Verify the initial challenge-response for new mobile devices.
   */
  async verifyDeviceAttestation(
    userId: string,
    deviceId: string,
    challenge: string,
    signatureHex: string,
  ): Promise<boolean> {
    const key = RedisKeyBuilder.deviceAttestChallenge(userId);
    const storedChallenge = await this.redis.get(key);

    if (!storedChallenge || storedChallenge !== challenge) {
      this.logger.warn(`Attestation failed for user ${userId}: Challenge expired or mismatch`);
      throw new UnauthorizedException('Challenge expired or invalid');
    }

    const isVerified = await this.verifySignature(userId, deviceId, challenge, signatureHex);

    if (isVerified) {
      this.logger.log(`Device ${deviceId} successfully attested for user ${userId}`);
      await this.redis.del(key);
      await this.prisma.userDevice.update({
        where: { userId_deviceId: { userId, deviceId } },
        data: {
          attestationVerified: true,
          attestedAt: new Date(),
          isTrusted: true, // Mark as trusted only AFTER successful attestation
        },
      });
    }

    return isVerified;
  }

  /**
   * Formats a raw ECDSA public key into a valid SPKI (Subject Public Key Info) format.
   * Optimized for P-256 (secp256r1) and secp256k1.
   */
  private formatRawPublicKey(rawKey: Buffer, algorithm = 'p256'): Buffer {
    if (rawKey.length !== 65 && rawKey.length !== 33) {
      throw new Error(`Unsupported public key length: ${rawKey.length} bytes.`);
    }

    const isP256 = algorithm === 'p256' || algorithm === 'secp256r1';

    // id-ecPublicKey OID: 1.2.840.10045.2.1
    const idEcPublicKeyOID = Buffer.from([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);

    // Curve OID
    // p256 (secp256r1): 1.2.840.10045.3.1.7 -> 06 08 2a 86 48 ce 3d 03 01 07
    // secp256k1: 1.3.132.0.10 -> 06 05 2b 81 04 00 0a
    const curveOID = isP256 
      ? Buffer.from([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07])
      : Buffer.from([0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a]);

    // Algorithm Identifier sequence
    const algIdentifier = Buffer.concat([
      Buffer.from([0x30, idEcPublicKeyOID.length + curveOID.length]),
      idEcPublicKeyOID,
      curveOID
    ]);

    // Bit String header: 03 (type) + length + 00 (unused bits)
    const bitStringContentLen = rawKey.length + 1;
    const bitStringHeader = Buffer.from([0x03, bitStringContentLen, 0x00]);

    // Total Sequence header
    const totalContentLen = algIdentifier.length + bitStringHeader.length + rawKey.length;
    const seqHeader = Buffer.alloc(totalContentLen > 127 ? 4 : 2);
    if (totalContentLen > 127) {
      seqHeader.writeUInt8(0x30, 0);
      seqHeader.writeUInt8(0x81, 1);
      seqHeader.writeUInt8(totalContentLen, 2);
    } else {
      seqHeader.writeUInt8(0x30, 0);
      seqHeader.writeUInt8(totalContentLen, 1);
    }

    return Buffer.concat([seqHeader.slice(0, totalContentLen > 127 ? 3 : 2), algIdentifier, bitStringHeader, rawKey]);
  }
}
