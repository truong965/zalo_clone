import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { DEVICE_TRACKING_COOKIE } from '../services/device-fingerprint.service';

/**
 * Guard to ensure the device making the request has been verified.
 * - Mobile: Must have a verified ECDSA key (attestationVerified).
 * - Web: Must be marked as trusted (isTrusted), usually after 2FA.
 */
@Injectable()
export class DeviceAttestGuard implements CanActivate {
  private readonly logger = new Logger(DeviceAttestGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    // Only apply to authenticated users
    if (!user) {
      return true; 
    }

    // Identify device: Header for Mobile, Cookie for Web
    const deviceId = 
      request.headers['x-device-id'] || 
      request.cookies?.[DEVICE_TRACKING_COOKIE];
    
    if (!deviceId) {
      this.logger.warn(`User ${user.id} making protected request without any Device ID`);
      throw new UnauthorizedException('Không thể xác nhận danh tính thiết bị.');
    }

    const device = await this.prisma.userDevice.findUnique({
      where: {
        userId_deviceId: {
          userId: user.id,
          deviceId: deviceId as string,
        },
      },
      include: {
        user: {
          select: { twoFactorEnabled: true }
        }
      }
    });

    if (!device) {
      throw new UnauthorizedException('Thiết bị không hợp lệ hoặc chưa được đăng ký.');
    }

    // Security Filter 1: Allow bypass for regular users (no 2FA)
    if (!device.user.twoFactorEnabled) {
      return true;
    }

    // Security Filter 2: Safety Valve
    // If the user has NOT established ANY "Source of Truth" yet (no trusted web or attested mobile),
    // allow the request to pass. Enforcement only begins once at least one device is hardened.
    const hardenedDevicesCount = await this.prisma.userDevice.count({
      where: {
        userId: user.id,
        OR: [
          { isTrusted: true },
          { attestationVerified: true }
        ]
      }
    });

    if (hardenedDevicesCount === 0) {
      return true;
    }

    // Platform-specific Enforcement
    const isMobile = device.deviceType === 'MOBILE' || !!device.publicKey;

    if (isMobile) {
      // Mobile MUST be attested (ECDSA Verified)
      if (!device.attestationVerified) {
        this.logger.warn(`User ${user.id} attempt from unattested mobile: ${deviceId}`);
        throw new UnauthorizedException(
          'Thiết bị di động của bạn chưa được xác thực bảo mật. Vui lòng hoàn tất quy trình xác thực thiết bị.',
        );
      }
    } else {
      // Web MUST be trusted (Verified via 2FA)
      if (!device.isTrusted) {
        this.logger.warn(`User ${user.id} attempt from untrusted web device: ${deviceId}`);
        throw new UnauthorizedException(
          'Trình duyệt này chưa được tin cậy. Vui lòng xác thực 2 lớp để thực hiện hành động này.',
        );
      }
    }

    return true;
  }
}
