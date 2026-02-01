import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TokenService } from './services/token.service';
import { LoginDto } from './dto/login.dto';
import { DeviceInfo } from './interfaces/device-info.interface';
import jwtConfig from '../../config/jwt.config';
import { UserEntity } from '../users/entities/user.entity';
import { UserStatus } from '@prisma/client';
import { CallHistoryService } from '../social/service/call-history.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    // private readonly callHistoryService: CallHistoryService,
  ) {}

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

    // Verify password
    const isPasswordValid = this.usersService.isValidPassword(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check user status
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        `Account is ${user.status.toLowerCase()}`,
      );
    }

    // Revoke existing token for this device (if any)
    await this.tokenService.revokeDeviceSession(user.id, deviceInfo.deviceId);

    // Generate tokens
    const accessToken = this.tokenService.createAccessToken(user);
    const { token: refreshToken } = await this.tokenService.createRefreshToken(
      user,
      deviceInfo,
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiresIn(
        this.jwtConfiguration.accessToken.expiresIn,
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
      expiresIn: this.parseExpiresIn(
        this.jwtConfiguration.accessToken.expiresIn,
      ),
      tokenType: 'Bearer',
    };
  }

  /**
   * Logout from current device
   */
  async logout(userId: string, deviceId: string): Promise<void> {
    await this.tokenService.revokeDeviceSession(userId, deviceId);
    // Cleanup active calls
    // await this.callHistoryService.cleanupUserActiveCalls(userId);
  }

  /**
   * Get all active sessions
   */
  async getSessions(userId: string) {
    return this.tokenService.getUserSessions(userId);
  }

  /**
   * Revoke specific device session (remote logout)
   */
  async revokeSession(userId: string, deviceId: string): Promise<void> {
    await this.tokenService.revokeDeviceSession(userId, deviceId);
  }

  /**
   * Parse JWT expiresIn to seconds
   */
  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // Default 15 minutes

    const [, value, unit] = match;
    const num = parseInt(value, 10);

    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return num * (multipliers[unit] || 60);
  }
}
