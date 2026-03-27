import { DeviceListItemDto } from './dto/device-list.dto';
import { InternalEventNames } from '@common/contracts/events';
import { MailService } from 'src/shared/mail/mail.service';
import { RedisService } from 'src/shared/redis/redis.service';
import { RedisKeyBuilder } from 'src/shared/redis/redis-key-builder';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyOtpDto,
} from './dto/forgot-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
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
import { RedisRegistryService } from 'src/shared/redis/services/redis-registry.service';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisRegistry: RedisRegistryService,
    private readonly mailService: MailService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) { }

  /**
   * Login user and generate tokens
   */
  async login(loginDto: LoginDto, deviceInfo: DeviceInfo) {
    // Find user by phone number
    const fs = require('fs');
    const logFile = 'login_debug.log';
    const log = (msg: string) => fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
    
    log(`Attempting login for phone: ${loginDto.phoneNumber}`);
    const user = await this.usersService.findByPhoneNumber(
      loginDto.phoneNumber,
    );

    if (!user) {
      log(`User not found for phone: ${loginDto.phoneNumber}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check user status before password to avoid timing info leak
    if (user.status !== UserStatus.ACTIVE) {
      log(`User status is not ACTIVE: ${user.status} for user ${user.phoneNumber}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await this.usersService.isValidPassword(
      loginDto.password,
      user.passwordHash,
    );
    log(`Password valid for ${user.phoneNumber}: ${isPasswordValid}`);

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
      expiresIn: this.tokenService.parseExpiresIn(
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

    // PHASE 2: Emit event instead of direct call
    // CallModule listener (CallLogoutHandler) will handle active call cleanup
    this.eventEmitter.emit(InternalEventNames.USER_LOGGED_OUT, {
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

  /**
   * Request OTP for password reset
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('Email này chưa được đăng ký tài khoản.');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis (TTL: 90 seconds)
    const key = RedisKeyBuilder.emailOtp(dto.email);
    await this.redis.setex(key, 90, otp);

    // Send email
    await this.mailService.sendOtpEmail(dto.email, otp);

    return { message: 'Mã OTP đã được gửi đến email của bạn.' };
  }

  /**
   * Verify OTP code
   */
  async verifyOtp(dto: VerifyOtpDto) {
    const key = RedisKeyBuilder.emailOtp(dto.email);
    const storedOtp = await this.redis.get(key);

    if (!storedOtp || storedOtp !== dto.otp) {
      throw new BadRequestException('Mã OTP không chính xác hoặc đã hết hạn.');
    }

    return { message: 'Mã OTP hợp lệ.' };
  }

  /**
   * Reset password using OTP
   */
  async resetPassword(dto: ResetPasswordDto, deviceInfo: DeviceInfo) {
    const key = RedisKeyBuilder.emailOtp(dto.email);
    const storedOtp = await this.redis.get(key);

    if (!storedOtp || storedOtp !== dto.otp) {
      throw new BadRequestException('Mã OTP không chính xác hoặc đã hết hạn.');
    }

    const user = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại.');
    }

    // Update password and increment version to invalidate all sessions
    const passwordHash = await this.usersService.getHashPassword(
      dto.newPassword,
    );

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordVersion: { increment: 1 },
      },
    });

    // Invalidate OTP after successful reset
    await this.redis.del(key);

    // Phase 4/6: Emit event to kick all other devices
    this.eventEmitter.emit(QR_INTERNAL_EVENTS.FORCE_LOGOUT_DEVICES, {
      userId: user.id,
      deviceIds: [], // Empty array = all devices for this user
      reason: 'Password was reset via OTP',
    });

    // Generate tokens for the current device
    const tokens = await this.tokenService.generateTokens(
      updatedUser,
      deviceInfo,
    );

    return {
      message: 'Mật khẩu đã được đặt lại thành công.',
      data: tokens,
    };
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    deviceInfo: DeviceInfo,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    // Verify old password
    const isPasswordValid = await this.usersService.isValidPassword(
      dto.oldPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    // Hash new password
    const newPasswordHash = await this.usersService.getHashPassword(
      dto.newPassword,
    );

    // Update user: update passwordHash and increment passwordVersion
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newPasswordHash,
        passwordVersion: { increment: 1 },
      },
    });

    // Revoke other devices if requested
    const shouldLogoutAll = dto.logoutAllDevices !== false; // Default to true if not provided

    if (shouldLogoutAll) {
      this.eventEmitter.emit(QR_INTERNAL_EVENTS.FORCE_LOGOUT_DEVICES, {
        userId,
        deviceIds: [], // All devices
        reason: 'Password was changed',
      });
    }

    // Generate NEW tokens for the CURRENT device so it stays logged in
    const tokens = await this.tokenService.generateTokens(
      updatedUser,
      deviceInfo,
    );

    return {
      message: 'Đổi mật khẩu thành công',
      data: tokens,
    };
  }
}
