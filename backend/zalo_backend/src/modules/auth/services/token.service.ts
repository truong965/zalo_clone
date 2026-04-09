import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';
import * as crypto from 'crypto';

import {
  JwtPayload,
  JwtRefreshPayload,
} from '../interfaces/jwt-payload.interface';
import { DeviceInfo } from '../interfaces/device-info.interface';
import { PrismaService } from 'src/database/prisma.service';
import jwtConfig from 'src/config/jwt.config';
import {
  DeviceType,
  LoginMethod,
  TokenRevocationReason,
  User,
} from '@prisma/client';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  /**
   * Generate access token (short-lived, stateless)
   */
  createAccessToken(user: User, sessionId: string, deviceId: string): string {
    const payload: JwtPayload = {
      sub: user.id,
      type: 'access',
      pwdVer: user.passwordVersion,
      sid: sessionId,
      deviceId,
    };

    return this.jwtService.sign(payload, {
      secret: this.jwtConfiguration.accessToken.secret,
      expiresIn: this.jwtConfiguration.accessToken
        .expiresIn as JwtSignOptions['expiresIn'],
    });
  }

  /**
   * Generate refresh token and store in database
   */
  async createRefreshToken(
    user: User,
    deviceInfo: DeviceInfo,
    parentTokenId?: string,
    loginMethod: LoginMethod = LoginMethod.PASSWORD,
  ): Promise<{ token: string; tokenId: string }> {
    // Generate random token
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(refreshToken);

    // Calculate expiration
    const expiresAt = new Date();
    const refreshExpiresIn = this.jwtConfiguration.refreshToken.expiresIn;
    const daysMatch = refreshExpiresIn.match(/^(\d+)d$/);
    const days = daysMatch ? parseInt(daysMatch[1], 10) : 7;
    expiresAt.setDate(expiresAt.getDate() + days);

    // Store token in database
    const userToken = await this.prisma.userToken.create({
      data: {
        userId: user.id,
        refreshTokenHash: tokenHash,
        loginMethod,
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
        platform: deviceInfo.platform,
        browserName: deviceInfo.browserName,
        browserVersion: deviceInfo.browserVersion,
        osName: deviceInfo.osName,
        osVersion: deviceInfo.osVersion,
        ipAddress: deviceInfo.ipAddress,
        location: deviceInfo.location,
        userAgent: deviceInfo.userAgent,
        expiresAt,
        parentTokenId,
      },
    });

    // Create JWT with token metadata
    const payload: JwtRefreshPayload = {
      sub: user.id,
      type: 'refresh',
      pwdVer: user.passwordVersion,
      deviceId: deviceInfo.deviceId,
      tokenId: userToken.id,
    };

    const signedToken = this.jwtService.sign(payload, {
      secret: this.jwtConfiguration.refreshToken.secret,
      expiresIn: this.jwtConfiguration.refreshToken
        .expiresIn as JwtSignOptions['expiresIn'],
    });

    return { token: signedToken, tokenId: userToken.id };
  }

  /**
   * Combined method to generate access and refresh tokens
   */
  async generateTokens(
    user: User,
    deviceInfo: DeviceInfo,
    loginMethod: LoginMethod = LoginMethod.PASSWORD,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const { token: refreshToken, tokenId } = await this.createRefreshToken(
      user,
      deviceInfo,
      undefined,
      loginMethod,
    );
    const accessToken = this.createAccessToken(
      user,
      tokenId,
      deviceInfo.deviceId,
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiresIn(
        this.jwtConfiguration.accessToken.expiresIn,
      ),
    };
  }

  /**
   * Rotate refresh token (invalidate old, issue new)
   * ⭐ TOKEN REUSE DETECTION: If old token already has children → security breach
   */
  async rotateRefreshToken(
    oldTokenJwt: string,
    deviceInfo: DeviceInfo,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Verify JWT signature
    let payload: JwtRefreshPayload;
    try {
      payload = this.jwtService.verify(oldTokenJwt, {
        secret: this.jwtConfiguration.refreshToken.secret,
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Find token in database
    const oldToken = await this.prisma.userToken.findUnique({
      where: { id: payload.tokenId },
      include: {
        user: true,
        childTokens: true,
      },
    });

    if (!oldToken) {
      throw new UnauthorizedException('Token not found');
    }

    // ⭐ CRITICAL: Check for token reuse attack
    if (oldToken.childTokens.length > 0) {
      // Token already rotated → Possible theft
      await this.revokeTokenFamily(
        oldToken.id,
        TokenRevocationReason.SUSPICIOUS_ACTIVITY,
      );
      throw new UnauthorizedException(
        'Token reuse detected. All sessions revoked.',
      );
    }

    // Validate token status
    if (oldToken.isRevoked) {
      throw new UnauthorizedException('Token has been revoked');
    }

    if (oldToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Validate device fingerprint
    if (oldToken.deviceId !== deviceInfo.deviceId) {
      await this.revokeTokenFamily(
        oldToken.id,
        TokenRevocationReason.SUSPICIOUS_ACTIVITY,
      );
      throw new UnauthorizedException(
        'Device mismatch. Session revoked for security.',
      );
    }

    // Validate password version (instant invalidation on password change)
    if (oldToken.user.passwordVersion !== payload.pwdVer) {
      throw new UnauthorizedException('Password changed. Please login again.');
    }

    // Revoke old token
    await this.prisma.userToken.update({
      where: { id: oldToken.id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: TokenRevocationReason.TOKEN_ROTATION,
      },
    });

    // Generate new tokens (child of old token)
    const { token: refreshToken, tokenId } = await this.createRefreshToken(
      oldToken.user,
      deviceInfo,
      oldToken.id, // Set parent
      oldToken.loginMethod,
    );
    const accessToken = this.createAccessToken(
      oldToken.user,
      tokenId,
      deviceInfo.deviceId,
    );

    return { accessToken, refreshToken };
  }

  /**
   * Revoke entire token family (token + all descendants)
   * Used when detecting suspicious activity
   */
  async revokeTokenFamily(
    tokenId: string,
    reason: TokenRevocationReason,
  ): Promise<void> {
    // Find all tokens in family tree
    const tokenFamily = await this.findTokenFamily(tokenId);

    // Revoke all tokens
    await this.prisma.userToken.updateMany({
      where: {
        id: { in: tokenFamily },
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  /**
   * Find all tokens in family (ancestors + descendants) using a single recursive CTE
   */
  private async findTokenFamily(tokenId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_token_id FROM user_tokens WHERE id = ${tokenId}::uuid
        UNION ALL
        SELECT t.id, t.parent_token_id FROM user_tokens t
        INNER JOIN ancestors a ON a.parent_token_id = t.id
      ),
      descendants AS (
        SELECT id, parent_token_id FROM user_tokens WHERE id = ${tokenId}::uuid
        UNION ALL
        SELECT t.id, t.parent_token_id FROM user_tokens t
        INNER JOIN descendants d ON t.parent_token_id = d.id
      )
      SELECT DISTINCT id FROM (
        SELECT id FROM ancestors
        UNION
        SELECT id FROM descendants
      ) family
    `;

    return rows.map((r) => r.id);
  }

  /**
   * Revoke specific device session
   */
  async revokeDeviceSession(userId: string, deviceId: string): Promise<void> {
    await this.prisma.userToken.updateMany({
      where: {
        userId,
        deviceId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: TokenRevocationReason.MANUAL_LOGOUT,
      },
    });
  }

  /**
   * Revoke existing sessions by device type(s) for a user.
   * Returns list of revoked deviceIds for force-logout notification.
   */
  async revokeExistingSessionsByType(
    userId: string,
    deviceTypes: DeviceType[],
    options?: { excludeDeviceIds?: string[] },
  ): Promise<string[]> {
    const excludeDeviceIds = options?.excludeDeviceIds ?? [];
    const whereClause = {
      userId,
      deviceType: { in: deviceTypes },
      isRevoked: false,
      ...(excludeDeviceIds.length > 0
        ? { deviceId: { notIn: excludeDeviceIds } }
        : {}),
    };

    // Find active sessions to get their deviceIds before revoking
    const activeSessions = await this.prisma.userToken.findMany({
      where: whereClause,
      select: { deviceId: true },
      distinct: ['deviceId'],
    });

    if (activeSessions.length === 0) return [];

    // Revoke all sessions matching criteria
    await this.prisma.userToken.updateMany({
      where: whereClause,
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: TokenRevocationReason.NEW_LOGIN_OVERRIDE,
      },
    });

    return activeSessions.map((s) => s.deviceId);
  }

  /**
   * Revoke all existing PC/Desktop sessions for a user (enforce 1PC rule).
   * Used by both Password login and QR login flows.
   * Returns list of revoked deviceIds for force-logout notification.
   */
  async revokeExistingPCSessions(
    userId: string,
    options?: { excludeDeviceIds?: string[] },
  ): Promise<string[]> {
    return this.revokeExistingSessionsByType(
      userId,
      [DeviceType.WEB, DeviceType.DESKTOP],
      options,
    );
  }

  /**
   * Revoke all user sessions (e.g., on password change)
   */
  async revokeAllUserSessions(
    userId: string,
    reason: TokenRevocationReason,
  ): Promise<void> {
    await this.prisma.userToken.updateMany({
      where: {
        userId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  }

  /**
   * Get all active sessions for user
   */
  async getUserSessions(userId: string) {
    return this.prisma.userToken.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gte: new Date() },
      },
      select: {
        id: true,
        deviceId: true,
        deviceName: true,
        deviceType: true,
        platform: true,
        loginMethod: true,
        ipAddress: true,
        location: true,
        browserName: true,
        browserVersion: true,
        osName: true,
        osVersion: true,
        lastUsedAt: true,
      },
      orderBy: {
        lastUsedAt: 'desc',
      },
    });
  }

  /**
   * Update last used timestamp
   */
  async updateTokenLastUsed(tokenId: string): Promise<void> {
    await this.prisma.userToken.update({
      where: { id: tokenId },
      data: { lastUsedAt: new Date() },
    });
  }

  /**
   * Hash token using SHA-256
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Cleanup expired tokens (run as cron job)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.userToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          {
            isRevoked: true,
            revokedAt: { lt: thirtyDaysAgo },
          },
        ],
      },
    });

    return result.count;
  }

  /**
   * Parse JWT expiresIn string into seconds
   */
  parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // Default 15 minutes

    const [, value, unit] = match;
    const num = parseInt(value, 10);

    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    return num * (multipliers[unit] || 60);
  }
}
