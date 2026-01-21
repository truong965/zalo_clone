import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';
import { User, TokenRevocationReason } from '@prisma/client';
import * as crypto from 'crypto';

import {
  JwtPayload,
  JwtRefreshPayload,
} from '../interfaces/jwt-payload.interface';
import { DeviceInfo } from '../interfaces/device-info.interface';
import { PrismaService } from 'src/database/prisma.service';
import jwtConfig from 'src/config/jwt.config';

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
  createAccessToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      type: 'access',
      pwdVer: user.passwordVersion,
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
  ): Promise<{ token: string; tokenId: string }> {
    // Generate random token
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(refreshToken);

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    // Store token in database
    const userToken = await this.prisma.userToken.create({
      data: {
        userId: user.id,
        refreshTokenHash: tokenHash,
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName,
        deviceType: deviceInfo.deviceType,
        platform: deviceInfo.platform,
        ipAddress: deviceInfo.ipAddress,
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
    const accessToken = this.createAccessToken(oldToken.user);
    const { token: refreshToken } = await this.createRefreshToken(
      oldToken.user,
      deviceInfo,
      oldToken.id, // Set parent
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
   * Recursively find all tokens in family (parent + all descendants)
   */
  private async findTokenFamily(tokenId: string): Promise<string[]> {
    const token = await this.prisma.userToken.findUnique({
      where: { id: tokenId },
      include: {
        childTokens: true,
        parentToken: true,
      },
    });

    if (!token) return [];

    const family: string[] = [token.id];

    // Add parent and ancestors
    if (token.parentToken) {
      const ancestors = await this.findTokenFamily(token.parentToken.id);
      family.push(...ancestors);
    }

    // Add children and descendants
    for (const child of token.childTokens) {
      const descendants = await this.findTokenFamily(child.id);
      family.push(...descendants);
    }

    return [...new Set(family)]; // Remove duplicates
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
        ipAddress: true,
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
}
