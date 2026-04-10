import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { TwoFactorService } from './services/two-factor.service';
import { PrismaService } from 'src/database/prisma.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { RequestRegisterOtpDto, VerifyRegisterOtpDto } from './dto/register-otp.dto';
import type { ISmsProvider } from './interfaces/sms-provider.interface';
import { DeviceListItemDto } from './dto/device-list.dto';
import { InternalEventNames } from '@common/contracts/events';
import { MailService } from 'src/shared/mail/mail.service';
import { RedisService } from 'src/shared/redis/redis.service';
import { RedisKeyBuilder } from 'src/shared/redis/redis-key-builder';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/forgot-password.dto';
import { ReactivateAccountDto } from '../users/dto/deactivate-account.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import type { ConfigType } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TokenService } from './services/token.service';
import { UserEntity } from '../users/entities/user.entity';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { DeviceInfo } from './interfaces/device-info.interface';
import jwtConfig from '../../config/jwt.config';
import securityConfig from '../../config/security.config';
import { DeviceType, LoginMethod, UserStatus, TokenRevocationReason, TwoFactorMethod } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QR_INTERNAL_EVENTS } from 'src/common/constants/internal-events.constant';
import { RedisRegistryService } from 'src/shared/redis/services/redis-registry.service';
import { User } from '@prisma/client';
import { UserSecurityLockService } from 'src/shared/redis/services/user-security-lock.service';
import { DeviceService } from './services/device.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisRegistry: RedisRegistryService,
    private readonly mailService: MailService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly securityLock: UserSecurityLockService,
    private readonly deviceService: DeviceService,
    private readonly twoFactorService: TwoFactorService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    @Inject(securityConfig.KEY)
    private readonly securityConfiguration: ConfigType<typeof securityConfig>,
    @Inject('SMS_PROVIDER')
    private readonly smsProvider: ISmsProvider,
  ) { }

  /**
   * Login user and generate tokens
   */
  async login(loginDto: LoginDto, deviceInfo: DeviceInfo) {
    // Check account lockout first
    const lockedKey = RedisKeyBuilder.loginLocked(loginDto.phoneNumber);
    if (await this.redis.get(lockedKey)) {
      throw new HttpException(
        'Tài khoản của bạn tạm thời bị khóa do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const handleLoginFailed = async () => {
      const failKey = RedisKeyBuilder.loginFailCount(loginDto.phoneNumber);
      const fails: number = await this.redis.incr(failKey);
      if (fails === 1) await this.redis.expire(failKey, this.securityConfiguration.lockoutTtl); 
      if (fails >= this.securityConfiguration.maxLoginAttempts) {
        await this.redis.setex(lockedKey, this.securityConfiguration.lockoutTtl, '1');
        throw new HttpException(
          `Tài khoản của bạn tạm thời bị khóa do đăng nhập sai quá ${this.securityConfiguration.maxLoginAttempts} lần. Vui lòng thử lại sau ${Math.floor(this.securityConfiguration.lockoutTtl / 60)} phút.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    };

    // Find user by phone number
    const user = await this.usersService.findByPhoneNumber(
      loginDto.phoneNumber,
    );
    
    this.logger.log(`Login attempt for phone: ${loginDto.phoneNumber}`);

    if (!user) {
      this.logger.warn(`User not found for phone: ${loginDto.phoneNumber}`);
      await handleLoginFailed();
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    // Check user status: SUSPENDED or DELETED are blocked
    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DELETED) {
      this.logger.warn(`User status is blocked: ${user.status} for user ${user.phoneNumber}`);
      throw new UnauthorizedException('Tài khoản của bạn đã bị khóa hoặc bị xóa.');
    }

    // Special Case: INACTIVE (Self-deactivated)
    if (user.status === UserStatus.INACTIVE) {
      // Must verify password first
      const isPasswordValid = await this.usersService.isValidPassword(
        loginDto.password,
        user.passwordHash,
      )
      if (!isPasswordValid) {
        await handleLoginFailed();
        throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
      }

      // Initiate "Reactivation 2FA" via centralized method
      return this.twoFactorService.initiateTwoFactorChallenge(user.id, deviceInfo, { 
        isReactivation: true 
      });
    }

    // Verify password
    const isPasswordValid = await this.usersService.isValidPassword(
      loginDto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      await handleLoginFailed();
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    // Success -> clear fail counter
    await this.redis.del(RedisKeyBuilder.loginFailCount(loginDto.phoneNumber));

    // Phase 4: 2FA Check before enforcing sessions
    if (user.twoFactorEnabled) {
      const isTrusted = await this.deviceService.isDeviceTrusted(
        user.id,
        deviceInfo.deviceId,
      );
      if (!isTrusted) {
        // Must go through 2FA via centralized challenge
        return this.twoFactorService.initiateTwoFactorChallenge(user.id, deviceInfo);
      }
    }

    return this.finalizeLogin(user, deviceInfo, LoginMethod.PASSWORD);
  }

  /**
   * Finalize login flow by enforcing device rules and generating tokens
   */
  async finalizeLogin(user: any, deviceInfo: DeviceInfo, loginMethod: LoginMethod = LoginMethod.PASSWORD) {
    // Phase 4: Enforce 1PC/1Mobile rule
    let revokedDeviceIds: string[] = [];
    let logoutReason = '';

    if (
      deviceInfo.deviceType === DeviceType.WEB ||
      deviceInfo.deviceType === DeviceType.DESKTOP
    ) {
      // Rule: Only 1 PC/Web session at a time
      revokedDeviceIds = await this.tokenService.revokeExistingPCSessions(
        user.id,
      );
      logoutReason = 'New login from another computer';
    } else if (deviceInfo.deviceType === DeviceType.MOBILE) {
      // Rule: Only 1 Mobile session at a time
      revokedDeviceIds = await this.tokenService.revokeExistingSessionsByType(
        user.id,
        [DeviceType.MOBILE],
      );
      logoutReason = 'New login from another mobile device';
    } else {
      // Other devices: Just revoke this specific device if it already exists
      await this.tokenService.revokeDeviceSession(user.id, deviceInfo.deviceId);
    }

    // Kick old sessions via Socket heartbeat/event if any were revoked
    if (revokedDeviceIds.length > 0) {
      this.eventEmitter.emit(QR_INTERNAL_EVENTS.FORCE_LOGOUT_DEVICES, {
        userId: user.id,
        deviceIds: revokedDeviceIds,
        reason: logoutReason,
      });
    }

    // Create/Update Device Registry Record using DeviceService
    await this.deviceService.upsertDevice(user.id, deviceInfo);

    // Generate tokens
    const { token: refreshToken, tokenId } =
      await this.tokenService.createRefreshToken(
        user,
        deviceInfo,
        undefined,
        loginMethod,
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
   * Fetch user needed for finalizeLogin (called from TwoFactorController post-2FA)
   */
  async getUserForFinalize(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
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

    // Phase 2: Untrust device on explicit logout, to require 2FA next time!
    await this.deviceService.untrustDevice(userId, deviceId);

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
  async getSessions(userId: string, currentDeviceId?: string): Promise<{ currentDeviceId?: string; sessions: DeviceListItemDto[] }> {
    const sessions = await this.tokenService.getUserSessions(userId);

    // Fetch trust and detail info from UserDevice registry
    const devices = await this.prisma.userDevice.findMany({
      where: { userId },
    });
    const deviceMap = new Map(devices.map((d) => [d.deviceId, d]));

    // Get all socket metadata to check which devices are currently connected
    const socketIds = await this.redisRegistry.getUserSockets(userId);
    const connectedDeviceIds = new Set<string>();

    for (const socketId of socketIds) {
      const metadata = await this.redisRegistry.getSocketMetadata(socketId);
      if (metadata) {
        connectedDeviceIds.add(metadata.deviceId);
      }
    }

    const sessionList = sessions.map((session) => {
      const registry = deviceMap.get(session.deviceId);
      
      return {
        deviceId: session.deviceId,
        deviceName: registry?.deviceName || session.deviceName || 'Unknown Device',
        platform: registry?.platform || session.platform || 'UNKNOWN',
        browserName: registry?.browserName || session.browserName || undefined,
        browserVersion: registry?.browserVersion || session.browserVersion || undefined,
        osName: registry?.osName || session.osName || undefined,
        osVersion: registry?.osVersion || session.osVersion || undefined,
        lastLocation: registry?.lastLocation || session.location || undefined,
        loginMethod: session.loginMethod,
        lastUsedAt: session.lastUsedAt,
        lastActiveAt: registry?.lastActiveAt || session.lastUsedAt,
        registeredAt: registry?.registeredAt || undefined,
        ipAddress: registry?.lastIp || session.ipAddress || 'Unknown IP',
        isTrusted: registry?.isTrusted ?? false,
        isOnline: connectedDeviceIds.has(session.deviceId),
      };
    });

    return { currentDeviceId, sessions: sessionList };
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
   * Request OTP for password reset (Phase 13: Unified 2FA)
   */
  async forgotPassword(dto: ForgotPasswordDto, deviceInfo: DeviceInfo) {
    // Find user by email or phone
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.identifier },
          { phoneNumber: dto.identifier }
        ]
      }
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản với thông tin đã cung cấp.');
    }

    // Initiate 2FA session with isForgotPassword flag
    return this.twoFactorService.initiateTwoFactorChallenge(user.id, deviceInfo, { 
      isForgotPassword: true 
    });
  }


  /**
   * Reset password using Reset Token (Phase 13: Unified 2FA)
   */
  async resetPassword(dto: ResetPasswordDto) {
    // 1. Find Reset Token session in Redis to get UserID
    // We scan or we need a way to verify the token is valid and associated with a user
    // The resetToken itself should be a key in redis: auth:password-reset:UUID -> userId
    
    // We should probably use a search or store the userId in the token's value
    // Let's assume resetToken key is `auth:password-reset:UUID` and value is `userId`
    const redisKey = `auth:password-reset:${dto.resetToken}`;
    const userId = await this.redis.get(redisKey);

    if (!userId) {
      throw new BadRequestException('Mã đặt lại mật khẩu không chính xác hoặc đã hết hạn.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại.');
    }

    return this.securityLock.runWithLock(user.id, async () => {
      // 1. Hash the new password
      const hashedPassword = await this.usersService.getHashPassword(dto.newPassword);

      // 2. Update user in database & increment password version
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashedPassword,
          passwordVersion: { increment: 1 }
        },
      });

      // 3. Revoke all existing sessions for security
      await this.tokenService.revokeAllUserSessions(user.id, TokenRevocationReason.PASSWORD_CHANGED);
      
      // Emit force logout to all live sockets
      this.eventEmitter.emit(QR_INTERNAL_EVENTS.FORCE_LOGOUT_DEVICES, {
        userId: user.id,
        deviceIds: [], // All devices
        reason: 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại.',
      });

      // 4. Consume the reset token
      await this.redis.del(redisKey);

      return { message: 'Mật khẩu của bạn đã được cập nhật thành công. Vui lòng đăng nhập lại.' };
    });
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    deviceInfo: DeviceInfo,
  ) {
    return this.securityLock.runWithLock(userId, async () => {
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

      // Clear auth cache to invalidate stale passwordVersion
      await this.redis.del(RedisKeyBuilder.authUserProfile(userId));

      // Revoke ALL existing sessions in DB (tokens become invalid)
      await this.tokenService.revokeAllUserSessions(
        userId,
        TokenRevocationReason.PASSWORD_CHANGED,
      );

      // Revoke other devices if requested
      const shouldLogoutAll = dto.logoutAllDevices !== false; // Default to true if not provided

      if (shouldLogoutAll) {
        this.eventEmitter.emit(QR_INTERNAL_EVENTS.FORCE_LOGOUT_DEVICES, {
          userId,
          deviceIds: [], // All devices 
          reason: 'Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại trên tất cả thiết bị.',
        });
      }

      return {
        message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.',
        data: null, // Force logout on current device by not providing new tokens
      };
    });
  }


  /**
   * Request OTP for registration
   */
  async requestRegisterOtp(dto: RequestRegisterOtpDto) {
    return this.securityLock.runWithPhoneLock(dto.phoneNumber, async () => {
      // 1. Check if user already exists (ACTIVE or INACTIVE)
      const existingUser = await this.usersService.findByPhoneNumber(dto.phoneNumber);
      if (existingUser && existingUser.status !== UserStatus.DELETED) {
        throw new BadRequestException('Số điện thoại này đã được đăng ký.');
      }

      // 2. Check Cooldown (45 seconds)
      const cooldownKey = RedisKeyBuilder.registerOtpCooldown(dto.phoneNumber);
      const isCooldownExist = await this.redis.get(cooldownKey);
      if (isCooldownExist) {
        throw new HttpException(
          'Bạn vừa yêu cầu mã OTP. Vui lòng đợi 45 giây trước khi thực hiện yêu cầu mới.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // 3. Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // 4. Store in Redis (TTL: 90 seconds)
      const otpKey = RedisKeyBuilder.registerOtp(dto.phoneNumber);
      await this.redis.setex(otpKey, this.securityConfiguration.otpTtl, otp);

      // 5. Set Cooldown (TTL: 45 seconds)
      await this.redis.setex(cooldownKey, this.securityConfiguration.cooldownTtl, 'true');

      // 6. Send SMS via Provider (Telegram or SpeedSMS)
      await this.smsProvider.sendOtp(dto.phoneNumber, otp);

      return { message: 'Mã OTP đã được gửi đến số điện thoại của bạn.' };
    });
  }

  /**
   * Verify registration OTP
   */
  async verifyRegisterOtp(dto: VerifyRegisterOtpDto) {
    return this.securityLock.runWithPhoneLock(dto.phoneNumber, async () => {
      const otpKey = RedisKeyBuilder.registerOtp(dto.phoneNumber);
      const storedOtp = await this.redis.get(otpKey);

      if (!storedOtp || storedOtp !== dto.otp) {
        throw new BadRequestException('Mã OTP không chính xác hoặc đã hết hạn.');
      }

      // 1. Mark as verified in Redis (TTL: 10 minutes)
      const verifiedKey = RedisKeyBuilder.registerVerified(dto.phoneNumber);
      await this.redis.setex(verifiedKey, this.securityConfiguration.registerVerifiedTtl, 'true');

      // 2. Cleanup OTP immediately to prevent reuse
      await this.redis.del(otpKey);

      return { message: 'Xác thực mã OTP thành công. Bạn có thể tiếp tục đăng ký.' };
    });
  }

  /**
   * Complete registration with OTP verification check
   */
  async register(dto: CreateUserDto) {
    return this.securityLock.runWithPhoneLock(dto.phoneNumber, async () => {
      const verifiedKey = RedisKeyBuilder.registerVerified(dto.phoneNumber);
      const isVerified = await this.redis.get(verifiedKey);

      if (!isVerified) {
        throw new BadRequestException('Số điện thoại chưa được xác thực qua OTP hoặc phiên xác thực đã hết hạn.');
      }

      // Execute registration
      const user = await this.usersService.register(dto);

      // Cleanup verified flag immediately after successful registration
      await this.redis.del(verifiedKey);

      return user;
    });
  }
}
