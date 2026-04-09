import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  Logger,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type { ITotpProvider, TotpSetupData } from '../interfaces/totp-provider.interface';
import type { ISmsProvider } from '../interfaces/sms-provider.interface';
import { PrismaService } from 'src/database/prisma.service';
import { EncryptionUtil } from 'src/common/utils/encryption.util';
import * as bcrypt from 'bcrypt';
import { TwoFactorMethod, UserStatus } from '@prisma/client';
import { RedisService } from 'src/shared/redis/redis.service';
import { RedisKeyBuilder } from 'src/shared/redis/redis-key-builder';
import { MailService } from 'src/shared/mail/mail.service';
import * as crypto from 'crypto';
import { DeviceService } from './device.service';
import { PushNotificationService } from 'src/modules/notifications/services/push-notification.service';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { OUTBOUND_SOCKET_EVENT } from 'src/common/events/outbound-socket.event';
import { UserSecurityLockService } from 'src/shared/redis/services/user-security-lock.service';
import securityConfig from 'src/config/security.config'; 
import type { ConfigType } from '@nestjs/config';


@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
    
  constructor(
    @Inject('TOTP_PROVIDER') private readonly totpProvider: ITotpProvider,
    @Inject('SMS_PROVIDER') private readonly smsProvider: ISmsProvider,
    private readonly mailService: MailService,
    private readonly deviceService: DeviceService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly securityLock: UserSecurityLockService,
    @Inject(securityConfig.KEY)
    private readonly securityConfiguration: ConfigType<typeof securityConfig>,
  ) {}

  /**
   * Internal helper to check and set rate limit for 2FA requests
   */
  private async checkRateLimit(userId: string, method: string): Promise<void> {
    const cooldownKey = RedisKeyBuilder.twoFactorCooldown(userId, method);
    const existing = await this.redis.get(cooldownKey);
    if (existing) {
      throw new HttpException(
        'Vui lòng đợi 45 giây trước khi yêu cầu gửi lại mã xác thực.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Set 45s cooldown
    await this.redis.setex(cooldownKey, this.securityConfiguration.cooldownTtl, '1');
  }

  private async setActiveMethod(pendingToken: string, method: string): Promise<void> {
    const pendingKey = RedisKeyBuilder.twoFactorPending(pendingToken);
    const raw = await this.redis.get(pendingKey);
    if (!raw) return;

    const data = JSON.parse(raw);
    const oldMethod = data.activeChallengeMethod;
    const newMethod = method.toUpperCase();

    if (oldMethod === newMethod) return;

    // 1. Update active method
    data.activeChallengeMethod = newMethod;

    // 2. Invalidate other states - "Clear old auth"
    data.pushVerified = false; // Reset any pending Push approvals

    // 3. Clear OTPs for previous methods to be safe
    // Note: We don't delete until we save the updated session
    const userId = data.userId;
    if (oldMethod === 'SMS') await this.redis.del(RedisKeyBuilder.twoFactorSmsOtp(userId));
    if (oldMethod === 'EMAIL') await this.redis.del(RedisKeyBuilder.twoFactorEmailOtp(userId));

    await this.redis.setex(pendingKey, this.securityConfiguration.session2faTtl, JSON.stringify(data));
  }

  /**
   * Set TOTP as active method without sending any code
   */
  async sendTotpChallenge(pendingToken: string): Promise<void> {
    const pendingData = await this.getPendingSession(pendingToken);
    // Rate limit switching to TOTP too (optional but consistent)
    await this.checkRateLimit(pendingData.userId, 'TOTP');
    await this.setActiveMethod(pendingToken, 'TOTP');
  }


  // ========== SETUP FLOWS ==========

  async initSetup(userId: string, deviceId: string): Promise<TotpSetupData> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const { secret, otpAuthUri, qrCodeDataUrl } =
      await this.totpProvider.generateSecret(
        user.email || user.phoneNumber,
        'Zalo Clone',
      );

    // Temp save secret in Redis for verification before enabling
    const pendingKey = RedisKeyBuilder.twoFactorPendingSetup(userId);
    await this.redis.setex(pendingKey, this.securityConfiguration.setup2faTtl, secret);

    // Store the device ID that started the setup to trust it later
    const deviceKey = RedisKeyBuilder.twoFactorPendingSetup(userId + ':device');
    await this.redis.setex(deviceKey, this.securityConfiguration.setup2faTtl, deviceId);

    return { secret, otpAuthUri, qrCodeDataUrl };
  }

  async confirmSetup(
    userId: string,
    token: string,
  ): Promise<{ backupCodes?: string[] }> {
    const pendingKey = RedisKeyBuilder.twoFactorPendingSetup(userId);
    const secret = await this.redis.get(pendingKey);

    if (!secret) {
      throw new BadRequestException('Setup expired or not initiated');
    }

    const isValid = await this.totpProvider.verify(secret, token);
    if (!isValid) {
      throw new BadRequestException('Invalid authentication code');
    }

    // Encrypt secret for DB
    const encryptedSecret = EncryptionUtil.encrypt(secret);

    // Generate backup codes (Commented out)
    /*
    const backupCodes = this.generateRandomBackupCodes(10);
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, 10)),
    );
    */

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: encryptedSecret,
        // twoFactorBackupCodes: hashedBackupCodes,
        twoFactorSetupAt: new Date(),
        twoFactorMethod: TwoFactorMethod.TOTP,
      },
    });

    // Automatically trust the device used to set up 2FA
    const pendingData = await this.redis.get(RedisKeyBuilder.twoFactorPendingSetup(userId + ':device'));
    if (pendingData) {
      await this.deviceService.trustDevice(userId, pendingData);
      await this.redis.del(RedisKeyBuilder.twoFactorPendingSetup(userId + ':device'));
    }

    await this.redis.del(pendingKey);

    return { /* backupCodes */ };
  }

  async disable(userId: string, token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorEnabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    const secret = EncryptionUtil.decrypt(user.twoFactorSecret!);
    const isValid = await this.totpProvider.verify(secret, token);

    if (!isValid) {
      throw new BadRequestException('Invalid authentication code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        // twoFactorBackupCodes: [],
        twoFactorMethod: null,
        twoFactorSetupAt: null,
      },
    });
  }

  // ========== SECURE IDENTITY UPDATES ==========

  /**
   * Request an email change. Verifies password and sends OTP to the NEW email.
   */
  async requestEmailChange(userId: string, password: string, newEmail: string): Promise<void> {
    return this.securityLock.runWithLock(userId, async () => {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      // 1. Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        throw new BadRequestException('Mật khẩu hiện tại không chính xác');
      }

      // 2. Check if new email is already taken
      const existing = await this.prisma.user.findFirst({ where: { email: newEmail } });
      if (existing) {
        throw new BadRequestException('Email này đã được sử dụng bởi tài khoản khác');
      }

      // 3. Generate OTP and store in Redis
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const key = `auth:email_change:${userId}`;
      await this.redis.setex(key, this.securityConfiguration.otpTtl, JSON.stringify({ newEmail, otp })); // Use central OTP TTL

      // 4. Send OTP to the NEW email
      await this.mailService.sendOtpEmail(newEmail, otp);
    });
  }

  /**
   * Confirm email change using OTP from the new email.
   */
  async confirmEmailChange(userId: string, otp: string, updateEmailFn: (uid: string, email: string) => Promise<any>): Promise<void> {
    return this.securityLock.runWithLock(userId, async () => {
      const key = `auth:email_change:${userId}`;
      const raw = await this.redis.get(key);
      if (!raw) throw new BadRequestException('Yêu cầu đổi email đã hết hạn hoặc chưa được khởi tạo');

      const { newEmail, otp: storedOtp } = JSON.parse(raw);
      if (storedOtp !== otp) {
        throw new BadRequestException('Mã xác thực không chính xác');
      }

      // Perform the update via internal method
      await updateEmailFn(userId, newEmail);

      // Cleanup
      await this.redis.del(key);
    });
  }

  // ========== MANAGEMENT ==========

  /**
   * Update preferred 2FA method. 
   * If method IS NOT TOTP and 2FA is currently disabled, it will enable it (requires password).
   */
  async updateTwoFactorMethod(userId: string, method: TwoFactorMethod, password?: string): Promise<void> {
    return this.securityLock.runWithLock(userId, async () => {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      // Security: Updating 2FA settings requires password confirmation
      if (password) {
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
          throw new BadRequestException('Mật khẩu hiện tại không chính xác');
        }
      } else if (!user.twoFactorEnabled) {
        // Cannot enable 2FA without password verification
        throw new BadRequestException('Vui lòng cung cấp mật khẩu để kích hoạt bảo mật 2 lớp');
      }

      // Security: Cannot switch to EMAIL if no email is linked
      if (method === TwoFactorMethod.EMAIL && !user.email) {
        throw new BadRequestException('Vui lòng liên kết email trước khi kích hoạt phương thức này');
      }

      // Special case for TOTP: cannot switch to TOTP unless a secret already exists (setup complete)
      if (method === TwoFactorMethod.TOTP && !user.twoFactorSecret) {
        throw new BadRequestException('Vui lòng thiết lập App Authenticator trước khi chọn làm phương thức mặc định');
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorMethod: method,
          twoFactorEnabled: true, // Enabling or switching method always ensures it's ON
          twoFactorSetupAt: user.twoFactorSetupAt || new Date(),
        }
      });
    });
  }

  // ========== LOGIN CHALLENGE / VERIFY ==========

  /**
   * Universal 2FA initiation for Login, Reactivation, and Forgot Password
   */
  async initiateTwoFactorChallenge(
    userId: string, 
    deviceInfo: any, 
    options: { isReactivation?: boolean; isForgotPassword?: boolean } = {}
  ) {
    const user = await this.prisma.user.findUnique({ 
      where: { id: userId },
      select: { 
        id: true, 
        phoneNumber: true, 
        email: true, 
        twoFactorEnabled: true, 
        twoFactorMethod: true 
      }
    });

    if (!user) throw new NotFoundException('User not found');

    const pendingToken = crypto.randomBytes(32).toString('hex');
    const pendingData = {
      userId,
      deviceInfo,
      isForgotPassword: !!options.isForgotPassword,
      isReactivation: !!options.isReactivation,
      pushVerified: false,
      activeChallengeMethod: null as string | null, // Track which method is currently shown on UI
    };

    // TTL for the 2FA login session
    await this.redis.setex(
      RedisKeyBuilder.twoFactorPending(pendingToken),
      this.securityConfiguration.session2faTtl,
      JSON.stringify(pendingData),
    );

    // Determine available methods
    const availableMethods: string[] = [];
    if (user.phoneNumber) availableMethods.push(TwoFactorMethod.SMS);
    if (user.email) availableMethods.push(TwoFactorMethod.EMAIL);
    
    // Push is only for TRUSTED mobile devices
    const hasTrustedMobile = (await this.deviceService.getTrustedDevicesForPush(user.id)).length > 0;
    if (hasTrustedMobile) availableMethods.push('PUSH');

    if (user.twoFactorEnabled && user.twoFactorMethod === TwoFactorMethod.TOTP) {
      availableMethods.push(TwoFactorMethod.TOTP);
    }

    const preferredMethod = user.twoFactorMethod || (user.phoneNumber ? TwoFactorMethod.SMS : TwoFactorMethod.EMAIL);

    let autoTriggered = false;
    // Seamless Login Rule: Auto-trigger the challenge
    if (!options.isForgotPassword) {
      if (availableMethods.includes('PUSH')) {
        // Push takes priority
        await this.sendPushChallenge(pendingToken, true).catch(err => {
          this.logger.error(`Failed to auto-trigger push challenge: ${err.message}`);
        });
        autoTriggered = true;
      } else if (preferredMethod === TwoFactorMethod.SMS) {
        await this.sendSmsChallenge(pendingToken, true).catch(err => {
          this.logger.error(`Failed to auto-trigger SMS challenge: ${err.message}`);
        });
        autoTriggered = true;
      } else if (preferredMethod === TwoFactorMethod.EMAIL) {
        await this.sendEmailChallenge(pendingToken, true).catch(err => {
          this.logger.error(`Failed to auto-trigger Email challenge: ${err.message}`);
        });
        autoTriggered = true;
      }
    }

    return {
      status: '2FA_REQUIRED',
      pendingToken,
      availableMethods,
      preferredMethod: autoTriggered && availableMethods.includes('PUSH') ? 'PUSH' : preferredMethod,
      autoTriggered,
      ...options
    };
  }

  /**
   * Send SMS OTP challenge for a pending login
   * Fetches user from pendingToken session, sends OTP to their phone
   */
  async sendSmsChallenge(pendingToken: string, isAutoTrigger = false): Promise<{ maskedPhone: string }> {
    const pendingData = await this.getPendingSession(pendingToken);
    
    if (!isAutoTrigger) {
      await this.checkRateLimit(pendingData.userId, 'SMS');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: pendingData.userId },
      select: { id: true, phoneNumber: true },
    });

    if (!user?.phoneNumber) {
      throw new BadRequestException('No phone number associated with this account');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const smsKey = RedisKeyBuilder.twoFactorSmsOtp(user.id);
    await this.redis.setex(smsKey, this.securityConfiguration.otpTtl, otp);

    await this.smsProvider.sendOtp(user.phoneNumber, otp);
    
    // Update active method
    await this.setActiveMethod(pendingToken, 'SMS');

    const maskedPhone = user.phoneNumber.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2');
    return { maskedPhone };
  }

  /**
   * Send Email OTP challenge for a pending login
   */
  async sendEmailChallenge(pendingToken: string, isAutoTrigger = false): Promise<{ maskedEmail: string }> {
    const pendingData = await this.getPendingSession(pendingToken);
    
    if (!isAutoTrigger) {
      await this.checkRateLimit(pendingData.userId, 'EMAIL');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: pendingData.userId },
      select: { id: true, email: true },
    });

    if (!user?.email) {
      throw new BadRequestException('No email associated with this account');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const emailKey = RedisKeyBuilder.twoFactorEmailOtp(user.id);
    await this.redis.setex(emailKey, this.securityConfiguration.otpTtl, otp);

    await this.mailService.sendTwoFactorEmail(user.email, otp);
    
    // Update active method
    await this.setActiveMethod(pendingToken, 'EMAIL');

    const [userPart, domainPart] = user.email.split('@');
    const maskedEmail = `${userPart.substring(0, 3)}***@${domainPart}`;
    return { maskedEmail };
  }

  /**
   * Send Push Notification challenge to all trusted mobile devices
   */
  async sendPushChallenge(pendingToken: string, isAutoTrigger = false): Promise<void> {
    const pendingData = await this.getPendingSession(pendingToken);
    const { userId, deviceInfo } = pendingData;

    if (!isAutoTrigger) {
      await this.checkRateLimit(userId, 'PUSH');
    }

    const trustedDevices = await this.deviceService.getTrustedDevicesForPush(userId);
    if (trustedDevices.length === 0) {
      throw new BadRequestException('No trusted mobile devices found for push notification');
    }

    // Trigger FCM to all trusted devices
    await this.pushNotificationService.sendLoginApprovalPush({
      userId,
      deviceName: deviceInfo.deviceName,
      location: deviceInfo.location,
      ipAddress: deviceInfo.ipAddress,
      pendingToken,
    });

    // Also emit a Socket event
    this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
      event: SocketEvents.LOGIN_APPROVAL_REQUEST,
      userId,
      data: {
        pendingToken,
        deviceName: deviceInfo.deviceName,
        location: deviceInfo.location,
        ipAddress: deviceInfo.ipAddress,
        timestamp: new Date().toISOString(),
      },
    });

    // Update active method
    await this.setActiveMethod(pendingToken, 'PUSH');
  }

  /**
   * Mobile App acknowledges the push (Approve/Reject)
   */
  async acknowledgePush(
    userId: string,
    deviceId: string,
    pendingToken: string,
    approved: boolean,
    signature?: string,
  ): Promise<void> {
    const pendingKey = RedisKeyBuilder.twoFactorPending(pendingToken);
    const raw = await this.redis.get(pendingKey);
    if (!raw) throw new UnauthorizedException('Session expired');

    const data = JSON.parse(raw);
    if (data.userId !== userId) throw new UnauthorizedException('Invalid user');

    // Security Hardening: If approved, must provide a valid ECDSA signature of the pendingToken
    if (approved) {
      if (!signature) {
        throw new BadRequestException('Phê duyệt đăng nhập yêu cầu chữ ký số xác thực thiết bị.');
      }

      const isVerified = await this.deviceService.verifySignature(userId, deviceId, pendingToken, signature);
      if (!isVerified) {
        this.logger.warn(`Push approval failed: Invalid signature from device ${deviceId} for user ${userId}`);
        throw new UnauthorizedException('Chữ ký xác thực thiết bị không hợp lệ.');
      }
    }

    // Update session state in Redis
    data.pushVerified = approved;
    await this.redis.setex(pendingKey, this.securityConfiguration.session2faTtl, JSON.stringify(data));

    // Emit socket event to Web client waiting in the room
    this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
      event: approved
        ? SocketEvents.TWO_FACTOR_APPROVED
        : SocketEvents.TWO_FACTOR_REJECTED,
      room: `2fa:${pendingToken}`,
      data: { pendingToken, approved },
    });
  }





  /**
   * Polling status for Web client
   */
  async getPollingStatus(pendingToken: string): Promise<{ pushVerified: boolean | null }> {
    const pendingKey = RedisKeyBuilder.twoFactorPending(pendingToken);
    const raw = await this.redis.get(pendingKey);
    if (!raw) return { pushVerified: null };

    const data = JSON.parse(raw);
    return { pushVerified: data.pushVerified ?? null };
  }

  /**
   * Verify a 2FA token and complete the login
   * Returns { userId, deviceInfo } so AuthService can finalizeLogin
   */
  async verifyAndComplete(
    pendingToken: string,
    code: string,
    method: TwoFactorMethod | 'PUSH',
  ): Promise<{ userId: string; deviceInfo: any; isForgotPassword: boolean; isReactivation: boolean; resetToken?: string }> {
    const pendingData = await this.getPendingSession(pendingToken);
    const { userId, deviceInfo } = pendingData;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        twoFactorSecret: true,
        // twoFactorBackupCodes: true,
        twoFactorEnabled: true,
      },
    });

    if (!user) throw new UnauthorizedException('User not found');
    
    // Normal 2FA requires enabled flag. Reactivation bypasses this because it's a mandatory identity check.
    if (!pendingData.isReactivation && !user.twoFactorEnabled) {
      throw new UnauthorizedException('2FA is not enabled');
    }

    let isValid = false;
    const requestedMethod = method.toUpperCase();

    // Protection: Ensure the method matches the one currently active on the UI
    // Strict Lock: All methods including TOTP must match activeChallengeMethod
    if (pendingData.activeChallengeMethod && requestedMethod !== pendingData.activeChallengeMethod) {
      throw new UnauthorizedException(`Phương thức ${requestedMethod} không khớp với yêu cầu hiện tại (${pendingData.activeChallengeMethod})`);
    }

    if (requestedMethod === TwoFactorMethod.TOTP) {
      if (!user.twoFactorSecret) throw new BadRequestException('TOTP not configured');
      const secret = EncryptionUtil.decrypt(user.twoFactorSecret);
      isValid = await this.totpProvider.verify(secret, code);
    } else if (requestedMethod === TwoFactorMethod.SMS) {
      const smsKey = RedisKeyBuilder.twoFactorSmsOtp(userId);
      const storedOtp = await this.redis.get(smsKey);
      isValid = storedOtp === code;
      if (isValid) await this.redis.del(smsKey);
    } else if (requestedMethod === TwoFactorMethod.EMAIL) {
      const emailKey = RedisKeyBuilder.twoFactorEmailOtp(userId);
      const storedOtp = await this.redis.get(emailKey);
      isValid = storedOtp === code;
      if (isValid) await this.redis.del(emailKey);
    } else if (requestedMethod === 'PUSH') {
      isValid = pendingData.pushVerified === true;
    }

    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired 2FA code');
    }

    // If this was a reactivation challenge, set the user status back to ACTIVE
    if (pendingData.isReactivation) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.ACTIVE },
      });
      // Clear profile cache
      await this.redis.del(RedisKeyBuilder.authUserProfile(userId));
    }

    // Cleanup pending session
    await this.redis.del(RedisKeyBuilder.twoFactorPending(pendingToken));

    // If this was a forgot password flow, generate a secure token for the reset phase
    let resetToken: string | undefined = undefined;
    if (pendingData.isForgotPassword) {
      resetToken = crypto.randomBytes(32).toString('hex');
      const resetKey = RedisKeyBuilder.accountPasswordResetToken(resetToken);
      // TTL for the reset phase, value is userId
      await this.redis.setex(resetKey, this.securityConfiguration.session2faTtl, userId);
    }

    return { 
      userId, 
      deviceInfo, 
      isForgotPassword: pendingData.isForgotPassword || false,
      isReactivation: pendingData.isReactivation || false,
      resetToken
    };
  }

  // ========== MANAGEMENT ==========

  async verifyTotp(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) return false;

    const secret = EncryptionUtil.decrypt(user.twoFactorSecret);
    return this.totpProvider.verify(secret, token);
  }

  /*
  async regenerateBackupCodes(userId: string, currentToken: string): Promise<string[]> {
    ...
  }
  */

  // ========== PRIVATE HELPERS ==========

  private async getPendingSession(
    pendingToken: string,
  ): Promise<{ 
    userId: string; 
    deviceInfo: any; 
    activeChallengeMethod?: string | null;
    pushVerified?: boolean; 
    isReactivation?: boolean; 
    isForgotPassword?: boolean;
  }> {
    const pendingKey = RedisKeyBuilder.twoFactorPending(pendingToken);
    const raw = await this.redis.get(pendingKey);
    if (!raw) {
      throw new UnauthorizedException('Session expired or invalid. Please login again.');
    }
    return JSON.parse(raw);
  }

  /*
  private async verifyBackupCode(...) { ... }
  private generateRandomBackupCodes(...) { ... }
  */
}
