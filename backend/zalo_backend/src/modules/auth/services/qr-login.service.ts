import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import jwtConfig from 'src/config/jwt.config';
import * as crypto from 'crypto';
import { Request, Response } from 'express';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from 'src/database/prisma.service';
import { TokenService } from './token.service';
import { DeviceFingerprintService } from './device-fingerprint.service';
import {
  QrSessionRedisService,
  QrSessionStatus,
} from './qr-session-redis.service';
import { RedisRateLimitService } from 'src/shared/redis/services/redis-rate-limit.service';
import { QrExchangeDto } from '../dto/qr-exchange.dto';
import { QrScanResponseDto } from '../dto/qr-response.dto';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { LoginMethod, UserStatus } from '@prisma/client';
import { DEVICE_TRACKING_COOKIE } from './device-fingerprint.service';
import { QR_INTERNAL_EVENTS } from 'src/common/constants/internal-events.constant';

@Injectable()
export class QrLoginService {
  private readonly logger = new Logger(QrLoginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly deviceFingerprint: DeviceFingerprintService,
    private readonly qrSession: QrSessionRedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly rateLimitService: RedisRateLimitService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  // ═══════════════════════ Pha 1: Generate QR ═══════════════════════

  /**
   * Web gọi để tạo QR session mới.
   * @param req Express Request (để đọc cookie, IP, user-agent)
   * @param res Express Response (để set cookie nếu chưa có)
   * @param webSocketId socketId của Web client (để emit đích danh sau này)
   */
  async generate(
    req: Request,
    res: Response,
    webSocketId: string,
  ): Promise<{ qrSessionId: string; deviceTrackingId: string }> {
    // Get or create device tracking cookie
    const deviceTrackingId = this.deviceFingerprint.getOrCreateTrackingId(
      req,
      res,
    );

    // Extract device info from request
    const deviceInfo = this.deviceFingerprint.extractDeviceInfo(req);

    // Create QR session in Redis
    const qrSessionId = await this.qrSession.createSession({
      webSocketId,
      deviceTrackingId,
      deviceName: deviceInfo.deviceName,
      platform: deviceInfo.platform,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
    });

    this.logger.log(`QR session generated: ${qrSessionId}`);
    return { qrSessionId, deviceTrackingId };
  }

  // ═══════════════════════ Pha 2: Mobile Scan ═══════════════════════

  /**
   * Mobile quét QR code và gửi qrSessionId lên server.
   * - Nếu thiết bị Web là Trusted → tự động approve (skip confirm)
   * - Nếu Untrusted → cập nhật status SCANNED, trả context cho Mobile hiển thị confirm
   */
  async scan(
    qrSessionId: string,
    mobileUserId: string,
    mobileDeviceId: string,
  ): Promise<QrScanResponseDto> {
    // 1. Validate session
    const session = await this.qrSession.getSession(qrSessionId);
    if (!session) {
      throw new BadRequestException('QR session not found or expired');
    }

    // ── Idempotency Check (Retry from same user) ──
    if (session.userId === mobileUserId) {
      if (session.status === QrSessionStatus.SCANNED) {
        const { browser, os } = this.parseUserAgent(session.userAgent);
        return {
          requireConfirm: true,
          browser,
          os,
          ipAddress: session.ipAddress,
          createdAt: session.createdAt,
        };
      }
      if (session.status === QrSessionStatus.APPROVED) {
        return { requireConfirm: false };
      }
    }

    if (session.status !== QrSessionStatus.PENDING) {
      throw new BadRequestException('QR session already scanned');
    }

    // 2. Check trusted device
    const isTrusted = await this.checkTrustedDevice(
      mobileUserId,
      session.deviceTrackingId,
    );

    if (isTrusted) {
      // ── Trusted: Auto-approve → jump straight to confirm flow ──
      this.logger.log(
        `Trusted device detected for user ${mobileUserId}, auto-approving`,
      );
      await this.confirmInternal(
        qrSessionId,
        mobileUserId,
        session,
        mobileDeviceId,
      );
      return { requireConfirm: false };
    }

    // ── Untrusted: Update status to SCANNED ──
    await this.qrSession.updateStatus(qrSessionId, QrSessionStatus.SCANNED, {
      userId: mobileUserId,
      mobileDeviceId,
    });

    // Emit qr.scanned to Web (targeted by socketId)
    this.emitToSocket(session.webSocketId, SocketEvents.QR_SCANNED, {
      qrSessionId,
      message: 'QR code scanned. Waiting for confirmation on mobile.',
    });

    // Parse context for Mobile confirm screen (anti-QRLJacking)
    const { browser, os } = this.parseUserAgent(session.userAgent);

    return {
      requireConfirm: true,
      browser,
      os,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
    };
  }

  /**
   * Mobile hủy quét mã (khi người dùng bấm "Quét mã khác").
   */
  async cancel(qrSessionId: string, mobileUserId: string): Promise<void> {
    const session = await this.qrSession.getSession(qrSessionId);
    if (!session) {
      return; // Ignore if already expired
    }

    if (session.status === QrSessionStatus.PENDING) {
      throw new UnauthorizedException(
        'Cannot cancel a pending session directly',
      );
    }

    if (session.userId !== mobileUserId) {
      throw new UnauthorizedException(
        'Only the user who scanned can cancel this session',
      );
    }

    await this.qrSession.updateStatus(qrSessionId, QrSessionStatus.CANCELLED);

    // Emit event to web to reset UI
    this.emitToSocket(session.webSocketId, SocketEvents.QR_CANCELLED, {
      qrSessionId,
      message: 'Mobile cancelled the scan.',
    });
  }

  // ═══════════════════════ Pha 3a: Mobile Confirm ═══════════════════════

  /**
   * Mobile xác nhận cho phép đăng nhập (chỉ cho Untrusted device).
   */
  async confirm(qrSessionId: string, mobileUserId: string): Promise<void> {
    const session = await this.qrSession.getSession(qrSessionId);
    if (!session) {
      throw new BadRequestException('QR session not found or expired');
    }
    if (session.status !== QrSessionStatus.SCANNED) {
      throw new BadRequestException(
        'QR session must be in SCANNED state to confirm',
      );
    }

    // Verify the user confirming is the same user who scanned
    if (session.userId && session.userId !== mobileUserId) {
      throw new UnauthorizedException(
        'Only the user who scanned can confirm this session',
      );
    }

    await this.confirmInternal(qrSessionId, mobileUserId, session);
  }

  // ═══════════════════════ Pha 3b: Web Exchange ═══════════════════════

  /**
   * Web đổi ticket lấy access/refresh token.
   * 4-factor verification: ticket + qrSessionId + deviceId (body) + device_tracking_id (cookie)
   */
  async exchange(
    dto: QrExchangeDto,
    req: Request,
    res: Response,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
  }> {
    const ip = req.ip || req.socket.remoteAddress || 'Unknown IP';

    // 0. Rate Limiting Check (3 attempts per minute per IP+Session)
    const rateLimit = await this.rateLimitService.checkQrExchangeRateLimit(
      ip,
      dto.qrSessionId,
    );
    if (!rateLimit.allowed) {
      this.logger.warn(
        `[AUDIT] Rate limit exceeded for QR exchange from IP ${ip} for session ${dto.qrSessionId}`,
      );
      throw new HttpException(
        'Too many exchange attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 1. Read device_tracking_id from cookie
    const cookieTrackingId = req.cookies?.[DEVICE_TRACKING_COOKIE] as
      | string
      | undefined;

    // 2. Get session from Redis
    const session = await this.qrSession.getSession(dto.qrSessionId);
    if (!session) {
      throw new BadRequestException('QR session not found or expired');
    }
    if (session.status !== QrSessionStatus.APPROVED) {
      throw new BadRequestException('QR session not yet approved');
    }
    if (!session.userId) {
      throw new BadRequestException('QR session missing user information');
    }

    // 3. 4-factor cross-verification
    // Factor 1 & 2: ticket + qrSessionId (verified by Redis key existence)
    // Factor 3: deviceId (body) must match session's deviceTrackingId
    if (dto.deviceId !== session.deviceTrackingId) {
      this.logger.warn(
        `[AUDIT] Exchange failed from IP ${ip} - deviceId mismatch. Body: ${dto.deviceId}, Session: ${session.deviceTrackingId}`,
      );
      throw new UnauthorizedException('Device verification failed');
    }
    // Factor 4: cookie must match session's deviceTrackingId
    if (!cookieTrackingId || cookieTrackingId !== session.deviceTrackingId) {
      this.logger.warn(
        `[AUDIT] Exchange failed from IP ${ip} - cookie mismatch. Cookie: ${cookieTrackingId}, Session: ${session.deviceTrackingId}`,
      );
      throw new UnauthorizedException('Device verification failed');
    }

    // 4. Acquire distributed lock
    const lockAcquired = await this.qrSession.acquireLock(session.userId);
    if (!lockAcquired) {
      throw new HttpException(
        'Another login is being processed. Please try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      // 5. Consume ticket atomically (one-time use)
      const ticket = await this.qrSession.consumeTicket(dto.qrSessionId);
      if (!ticket) {
        throw new BadRequestException('Ticket already used or expired');
      }

      // Verify ticket matches
      if (ticket !== dto.ticket) {
        this.logger.warn(
          `[AUDIT] Exchange failed from IP ${ip} - invalid ticket for session ${dto.qrSessionId}`,
        );
        throw new UnauthorizedException('Invalid ticket');
      }

      // 6. Get user from DB
      const user = await this.prisma.user.findUnique({
        where: { id: session.userId },
      });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // 7. Revoke existing PC sessions (enforce 1PC rule)
      const revokedDeviceIds = await this.tokenService.revokeExistingPCSessions(
        user.id,
        {
          excludeDeviceIds: session.mobileDeviceId
            ? [session.mobileDeviceId]
            : [],
        },
      );

      // 8. Create new tokens
      const deviceInfo = this.deviceFingerprint.extractDeviceInfo(req);
      // Override deviceId with the tracking cookie ID for consistency
      deviceInfo.deviceId = session.deviceTrackingId;

      const { token: refreshToken, tokenId } =
        await this.tokenService.createRefreshToken(
          user,
          deviceInfo,
          undefined,
          LoginMethod.QR_CODE,
        );
      const accessToken = this.tokenService.createAccessToken(
        user,
        tokenId,
        deviceInfo.deviceId,
      );

      // 9. Set device tracking cookie if not already set
      this.deviceFingerprint.setTrackingCookie(res, session.deviceTrackingId);

      // 10. Kick old PC sessions
      if (revokedDeviceIds.length > 0) {
        this.eventEmitter.emit(QR_INTERNAL_EVENTS.FORCE_LOGOUT_DEVICES, {
          userId: user.id,
          deviceIds: revokedDeviceIds,
          reason: 'New login via QR code',
        });
      }

      // 11. Cleanup: delete QR session from Redis
      await this.qrSession.deleteSession(dto.qrSessionId);

      this.logger.log(
        `QR exchange successful for user ${user.id}, revoked ${revokedDeviceIds.length} PC sessions`,
      );

      return {
        accessToken,
        refreshToken,
        expiresIn: this.tokenService.parseExpiresIn(
          this.jwtConfiguration.accessToken.expiresIn,
        ),
        tokenType: 'Bearer',
      };
    } finally {
      // Always release the lock
      await this.qrSession.releaseLock(session.userId);
    }
  }

  // ═══════════════════════ Polling: GET status ═══════════════════════

  /**
   * Web polls this to check QR session status (fallback when socket disconnects).
   */
  async getStatus(
    qrSessionId: string,
  ): Promise<{ status: QrSessionStatus | 'EXPIRED'; ticket?: string }> {
    const session = await this.qrSession.getSession(qrSessionId);
    if (!session) {
      return { status: 'EXPIRED' };
    }

    return {
      status: session.status,
      ticket:
        session.status === QrSessionStatus.APPROVED
          ? session.ticket
          : undefined,
    };
  }

  // ═══════════════════════ Private Helpers ═══════════════════════

  /**
   * Internal confirm logic — shared by both auto-approve (trusted) and manual confirm flows.
   */
  private async confirmInternal(
    qrSessionId: string,
    mobileUserId: string,
    session: { webSocketId: string },
    mobileDeviceId?: string,
  ): Promise<void> {
    // Generate exchange ticket (64 bytes → 128 hex chars)
    const ticket = crypto.randomBytes(64).toString('hex');

    // Update Redis: status = APPROVED with ticket and userId
    await this.qrSession.updateStatus(qrSessionId, QrSessionStatus.APPROVED, {
      ticket,
      userId: mobileUserId,
      mobileDeviceId,
    });

    // Emit qr.approved to Web (targeted by socketId)
    this.emitToSocket(session.webSocketId, SocketEvents.QR_APPROVED, {
      qrSessionId,
      ticket,
    });

    this.logger.log(`QR session approved: ${qrSessionId}`);
  }

  /**
   * Check if a device (identified by deviceTrackingId) is trusted for a user.
   * A device is "trusted" if it has ever had an approved login session.
   */
  private async checkTrustedDevice(
    userId: string,
    deviceTrackingId: string,
  ): Promise<boolean> {
    const existingToken = await this.prisma.userToken.findFirst({
      where: {
        userId,
        deviceId: deviceTrackingId,
      },
      select: { id: true },
    });

    return !!existingToken;
  }

  /**
   * Emit a Socket.IO event to a specific socketId via EventEmitter2.
   * The SocketGateway (or a listener) will handle the actual emission.
   */
  private emitToSocket(
    targetSocketId: string,
    event: string,
    data: unknown,
  ): void {
    this.eventEmitter.emit(QR_INTERNAL_EVENTS.EMIT_TO_SOCKET, {
      targetSocketId,
      event,
      data,
    });
  }

  /**
   * Parse browser name and OS from User-Agent string.
   * Used for the anti-QRLJacking confirm screen on Mobile.
   */
  private parseUserAgent(userAgent: string): { browser: string; os: string } {
    let browser = 'Unknown Browser';
    let os = 'Unknown OS';

    // Parse browser
    if (/Edg\//.test(userAgent)) browser = 'Microsoft Edge';
    else if (/OPR\/|Opera/.test(userAgent)) browser = 'Opera';
    else if (/Chrome\//.test(userAgent)) browser = 'Google Chrome';
    else if (/Firefox\//.test(userAgent)) browser = 'Mozilla Firefox';
    else if (/Safari\//.test(userAgent) && !/Chrome/.test(userAgent))
      browser = 'Safari';

    // Parse OS
    if (/Windows NT 10/.test(userAgent)) os = 'Windows 10/11';
    else if (/Windows NT/.test(userAgent)) os = 'Windows';
    else if (/Mac OS X/.test(userAgent)) os = 'macOS';
    else if (/Linux/.test(userAgent)) os = 'Linux';
    else if (/Android/.test(userAgent)) os = 'Android';
    else if (/iPhone|iPad/.test(userAgent)) os = 'iOS';

    return { browser, os };
  }
}
