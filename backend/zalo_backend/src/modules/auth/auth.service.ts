import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TokenService } from './services/token.service';
import { LoginDto } from './dto/login.dto';
import { DeviceInfo } from './interfaces/device-info.interface';
import jwtConfig from '../../config/jwt.config';
import { UserEntity } from '../users/entities/user.entity';
import { DeviceType, LoginMethod, UserStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QR_INTERNAL_EVENTS } from 'src/common/constants/internal-events.constant';
import { RedisRegistryService } from 'src/modules/redis/services/redis-registry.service';
import { DeviceListItemDto } from './dto/device-list.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisRegistry: RedisRegistryService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) { }

  /**
   * Login user and generate tokens
   */
  async login(loginDto: LoginDto, deviceInfo: DeviceInfo) {
    // Find user by phone number
    const user = await this.usersService.findByPhoneNumber(
      loginDto.phoneNumber,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check user status before password to avoid timing info leak
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await this.usersService.isValidPassword(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Phase 4: Enforce 1PC rule for WEB/DESKTOP logins
    if (
      deviceInfo.deviceType === DeviceType.WEB ||
      deviceInfo.deviceType === DeviceType.DESKTOP
    ) {
      // Revoke all existing PC sessions and get their IDs
      const revokedDeviceIds = await this.tokenService.revokeExistingPCSessions(
        user.id,
      );

      // Kick old PC sessions via Socket heartbeat/event
      if (revokedDeviceIds.length > 0) {
        this.eventEmitter.emit(QR_INTERNAL_EVENTS.FORCE_LOGOUT_DEVICES, {
          userId: user.id,
          deviceIds: revokedDeviceIds,
          reason: 'New login from another computer',
        });
      }
    } else {
      // Mobile/Other devices: Normal behavior (only revoke this specific device)
      await this.tokenService.revokeDeviceSession(user.id, deviceInfo.deviceId);
    }

    // Generate tokens
    const { token: refreshToken, tokenId } =
      await this.tokenService.createRefreshToken(
        user,
        deviceInfo,
        undefined,
        LoginMethod.PASSWORD,
      );
    const accessToken = this.tokenService.createAccessToken(
      user,
      tokenId,
      deviceInfo.deviceId,
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: this.tokenService.parseExpiresIn(
        this.jwtConfiguration.accessToken.expiresIn as string,
      ),
      tokenType: 'Bearer',
      user: new UserEntity(user),
    };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(oldRefreshToken: string, deviceInfo: DeviceInfo) {
    const { accessToken, refreshToken } =
      await this.tokenService.rotateRefreshToken(oldRefreshToken, deviceInfo);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.tokenService.parseExpiresIn(
        this.jwtConfiguration.accessToken.expiresIn as string,
      ),
      tokenType: 'Bearer',
    };
  }

  /**
   * Logout from current device
   */
  async logout(userId: string, deviceId: string): Promise<void> {
    await this.tokenService.revokeDeviceSession(userId, deviceId);

    // PHASE 2: Emit event instead of direct call
    // CallModule listener (CallLogoutHandler) will handle active call cleanup
    this.eventEmitter.emit('user.logged_out', {
      userId,
      deviceId,
      timestamp: new Date(),
    });
  }

  /**
   * Get all active sessions mapped to DeviceListItemDto
   */
  async getSessions(userId: string): Promise<DeviceListItemDto[]> {
    const sessions = await this.tokenService.getUserSessions(userId);

    // Get all socket metadata to check which devices are currently connected
    const socketIds = await this.redisRegistry.getUserSockets(userId);
    const connectedDeviceIds = new Set<string>();

    for (const socketId of socketIds) {
      const metadata = await this.redisRegistry.getSocketMetadata(socketId);
      if (metadata) {
        connectedDeviceIds.add(metadata.deviceId);
      }
    }

    return sessions.map((session) => ({
      deviceId: session.deviceId,
      deviceName: session.deviceName || 'Unknown Device',
      platform: session.platform || 'UNKNOWN',
      loginMethod: session.loginMethod,
      lastUsedAt: session.lastUsedAt,
      ipAddress: session.ipAddress || 'Unknown IP',
      isOnline: connectedDeviceIds.has(session.deviceId),
    }));
  }

  /**
   * Revoke specific device session (remote logout)
   */
  async revokeSession(userId: string, deviceId: string): Promise<void> {
    await this.tokenService.revokeDeviceSession(userId, deviceId);

    // Phase 6: Force disconnect the revoked device via Socket Gateway listener
    this.eventEmitter.emit(QR_INTERNAL_EVENTS.FORCE_LOGOUT_DEVICES, {
      userId,
      deviceIds: [deviceId],
      reason: 'Logged out from another device (Device Management)',
    });
  }
}
