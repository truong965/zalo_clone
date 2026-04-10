import {
  Controller,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Inject,
  Res,
  Get,
  Query,
  UseInterceptors,
  Logger,
  UseGuards
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { TwoFactorService } from './services/two-factor.service';
import {
  CurrentUser,
  GetDeviceInfo,
  Public,
  ResponseMessage,
} from 'src/common/decorator/customize';
import type { DeviceInfo } from './interfaces/device-info.interface';
import { AuthService } from './auth.service';
import { DeviceService } from './services/device.service';
import type {ConfigType}  from '@nestjs/config';
import jwtConfig from 'src/config/jwt.config';
import securityConfig from 'src/config/security.config';
import ms, { StringValue } from 'ms';
import { DeviceAttestGuard } from './guards/device-attest.guard';
import { DeviceType, TwoFactorMethod } from '@prisma/client';
import { EmailChangeConfirmDto, EmailChangeRequestDto } from './dto/email-change.dto';
import { UsersService } from '../users/users.service';
import { DeviceFingerprintInterceptor } from 'src/common/interceptor/device-fingerprint.interceptor';

@ApiTags('2FA')
@Controller('auth/2fa')
@UseInterceptors(DeviceFingerprintInterceptor)
export class TwoFactorController {
    private readonly logger = new Logger(TwoFactorController.name);
  constructor(
    private readonly twoFactorService: TwoFactorService,
    private readonly authService: AuthService,
    private readonly deviceService: DeviceService,
    private readonly usersService: UsersService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    @Inject(securityConfig.KEY)
    private readonly securityConfiguration: ConfigType<typeof securityConfig>,
  ) {}

  // =================== AUTHENTICATED SETUP ROUTES =====================

  @ApiBearerAuth()
  @Post('setup/init')
  @ApiOperation({ summary: 'Initiate 2FA setup and get QR code' })
  @ResponseMessage('Scan the QR Code with Google Authenticator')
  async initSetup(
    @CurrentUser('id') userId: string,
    @GetDeviceInfo() deviceInfo: DeviceInfo,
  ) {
    this.logger.log(`[2FA] Initializing setup for user: ${userId}`);
    const data = await this.twoFactorService.initSetup(
      userId,
      deviceInfo.deviceId,
    );
    return {
      message: 'Scan the QR Code with Google Authenticator',
      data: {
        otpAuthUri: data.otpAuthUri,
        qrCodeDataUrl: data.qrCodeDataUrl,
        expiresIn: this.securityConfiguration.setup2faTtl,
      },
    };
  }

  @ApiBearerAuth()
  @Post('setup/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm setup with the code from Authenticator app' })
  @ApiBody({ schema: { properties: { token: { type: 'string', example: '123456' } } } })
  async confirmSetup(
    @CurrentUser('id') userId: string,
    @Body('token') token: string,
  ) {
    if (!token) throw new BadRequestException('Token is required');
    this.logger.log(`[2FA] Confirming setup for user: ${userId}`);
    await this.twoFactorService.confirmSetup(userId, token);
    return {
      message: '2FA has been enabled successfully.',
    };
  }

  @ApiBearerAuth()
  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable 2FA (requires current TOTP code)' })
  @ApiBody({ schema: { properties: { token: { type: 'string', example: '123456' } } } })
  async disable(
    @CurrentUser('id') userId: string,
    @Body('token') token: string,
  ) {
    if (!token) throw new BadRequestException('Token is required');
    await this.twoFactorService.disable(userId, token);
    return { message: '2FA has been disabled' };
  }

  /*
  @ApiBearerAuth()
  @Post('backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate backup codes using current TOTP code' })
  @ApiBody({ schema: { properties: { token: { type: 'string', example: '123456' } } } })
  async regenerateBackupCodes(
    @CurrentUser('id') userId: string,
    @Body('token') token: string,
  ) {
    if (!token) throw new BadRequestException('Token is required');
    const backupCodes = await this.twoFactorService.regenerateBackupCodes(userId, token);
    return {
      message: 'Backup codes regenerated successfully. Store these safely!',
      data: { backupCodes },
    };
  }
  */

  // =================== AUTHENTICATED MANAGEMENT ROUTES =====================

  @ApiBearerAuth()
  @Patch('method')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update preferred 2FA method and/or enable 2FA' })
  @ApiBody({ 
    schema: { 
      properties: { 
        method: { type: 'string', enum: ['TOTP', 'SMS', 'EMAIL'] },
        password: { type: 'string', description: 'Required for enabling or security reasons' }
      } 
    } 
  })
  async updateMethod(
    @CurrentUser('id') userId: string,
    @Body('method') method: TwoFactorMethod,
    @Body('password') password?: string,
  ) {
    await this.twoFactorService.updateTwoFactorMethod(userId, method, password);
    return { message: `2FA method has been updated to ${method}` };
  }

  @ApiBearerAuth()
  @Post('email/change-request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request an email change (Password required)' })
  async requestEmailChange(
    @CurrentUser('id') userId: string,
    @Body() dto: EmailChangeRequestDto,
  ) {
    await this.twoFactorService.requestEmailChange(userId, dto.password, dto.newEmail);
    return { message: 'Mã xác thực đã được gửi tới email mới của bạn' };
  }

  @ApiBearerAuth()
  @Post('email/change-confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm email change with OTP' })
  async confirmEmailChange(
    @CurrentUser('id') userId: string,
    @Body() dto: EmailChangeConfirmDto,
  ) {
    await this.twoFactorService.confirmEmailChange(
      userId, 
      dto.otp, 
      (uid, email) => this.usersService.updateEmailInternal(uid, email)
    );
    return { message: 'Email đã được cập nhật thành công' };
  }

  // =================== PUBLIC LOGIN CHALLENGE ROUTES =====================

  /**
   * Request SMS OTP challenge for a pending 2FA login
   * Called after login returns 202 with pendingToken
   */
  @Public()
  @Post('challenge/sms')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Public] Send SMS OTP to phone. Call after login returns 202.',
  })
  @ApiBody({
    schema: {
      properties: { pendingToken: { type: 'string', example: 'uuid-v4...' } },
    },
  })
  async sendSmsChallenge(@Body('pendingToken') pendingToken: string) {
    if (!pendingToken) throw new BadRequestException('pendingToken is required');
    const { maskedPhone } = await this.twoFactorService.sendSmsChallenge(pendingToken);
    return {
      message: `OTP has been sent to ${maskedPhone}`,
      maskedPhone,
      expiresIn: this.securityConfiguration.otpTtl,
    };
  }

  @Public()
  @Post('challenge/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Public] Send Email OTP. Call after login returns 202.',
  })
  @ApiBody({
    schema: {
      properties: { pendingToken: { type: 'string', example: 'uuid-v4...' } },
    },
  })
  async sendEmailChallenge(@Body('pendingToken') pendingToken: string) {
    if (!pendingToken) throw new BadRequestException('pendingToken is required');
    const { maskedEmail } = await this.twoFactorService.sendEmailChallenge(pendingToken);
    return {
      message: `OTP has been sent to ${maskedEmail}`,
      maskedEmail,
      expiresIn: this.securityConfiguration.otpTtl,
    };
  }

  @Public()
  @Post('challenge/totp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Public] Activate Authenticator (TOTP) method for the session.',
  })
  @ApiBody({
    schema: {
      properties: { pendingToken: { type: 'string', example: 'uuid-v4...' } },
    },
  })
  async sendTotpChallenge(@Body('pendingToken') pendingToken: string) {
    if (!pendingToken) throw new BadRequestException('pendingToken is required');
    await this.twoFactorService.sendTotpChallenge(pendingToken);
    return {
      message: 'Authenticator method activated',
      expiresIn: this.securityConfiguration.session2faTtl,
    };
  }

  /**
   * Verify 2FA code and complete login. Returns tokens if valid.
   * method: 'totp' | 'sms' | 'email' | 'backup'
   */
  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Public] Verify 2FA code and get tokens. Call after login returns 202.',
  })
  @ApiBody({
    schema: {
      properties: {
        pendingToken: { type: 'string' },
        code: { type: 'string', example: '123456' },
        method: {
          type: 'string',
          enum: ['TOTP', 'SMS', 'EMAIL', 'PUSH'],
          default: 'SMS',
        },
        trustDevice: { type: 'boolean', default: false },
      },
    },
  })
  async verify(
    @Body('pendingToken') pendingToken: string,
    @Body('code') code: string,
    @Body('method') method: TwoFactorMethod | 'PUSH' = TwoFactorMethod.SMS,
    @Body('trustDevice') trustDevice: boolean = false,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!pendingToken || (!code && method !== 'PUSH')) {
      throw new BadRequestException('pendingToken and code are required');
    }

    const verifyResult = await this.twoFactorService.verifyAndComplete(
      pendingToken,
      code,
      method,
    );

    // If this is a Forgot Password session, return the resetToken instead of logging in
    if (verifyResult.isForgotPassword && verifyResult.resetToken) {
      return { 
        status: 'RESET_TOKEN_ISSUED',
        resetToken: verifyResult.resetToken,
        message: 'Identity verified. You can now reset your password.' 
      };
    }

    const { userId, deviceInfo } = verifyResult;

    // If user requested trust, mark device as trusted (Defer for mobile until attestation)
    if (trustDevice && deviceInfo.deviceType !== DeviceType.MOBILE) {
      await this.deviceService.trustDevice(userId, deviceInfo.deviceId);
    }

    // Finalize login and generate tokens
    const userRecord = await this.authService.getUserForFinalize(userId);
    const loginResult = await this.authService.finalizeLogin(userRecord, deviceInfo);

    if (deviceInfo.deviceType === DeviceType.MOBILE) {
      return {
        accessToken: loginResult.accessToken,
        refreshToken: loginResult.refreshToken,
        expiresIn: loginResult.expiresIn,
        tokenType: loginResult.tokenType,
        user: loginResult.user,
      };
    } else {
      const cookieOptions = {
        ...this.jwtConfiguration.refreshToken.cookieOptions,
        maxAge: this.jwtConfiguration.refreshToken.cookieOptions.maxAge as number,
      };
      res.cookie(
        this.jwtConfiguration.refreshToken.cookieName,
        loginResult.refreshToken,
        cookieOptions,
      );
      return {
        accessToken: loginResult.accessToken,
        expiresIn: loginResult.expiresIn,
        tokenType: loginResult.tokenType,
        user: loginResult.user,
      };
    }
  }

  // =================== PUSH AUTHENTICATION ROUTES =====================

  @Public()
  @Post('challenge/push')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger Push Challenge for 2FA' })
  @ApiBody({ schema: { properties: { pendingToken: { type: 'string' } } } })
  async sendPushChallenge(@Body('pendingToken') pendingToken: string) {
    if (!pendingToken) throw new BadRequestException('pendingToken is required');
    await this.twoFactorService.sendPushChallenge(pendingToken);
    return { message: 'Push notification sent to your trusted devices' };
  }

  @ApiBearerAuth()
  @UseGuards(DeviceAttestGuard)
  @Post('acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or Reject a login from a Mobile device' })
  @ApiBody({
    schema: {
      properties: {
        pendingToken: { type: 'string' },
        approved: { type: 'boolean' },
        signature: { type: 'string', description: 'ECDSA signature of pendingToken (required for approval)' },
      },
    },
  })
  async acknowledgePush(
    @CurrentUser('id') userId: string,
    @GetDeviceInfo() deviceInfo: DeviceInfo,
    @Body('pendingToken') pendingToken: string,
    @Body('approved') approved: boolean,
    @Body('signature') signature?: string,
  ) {
    if (!pendingToken) throw new BadRequestException('pendingToken is required');

    // Security: Only mobile devices can approve PUSH login requests
    if (deviceInfo.deviceType !== DeviceType.MOBILE) {
      throw new BadRequestException('Chỉ thiết bị di động mới có quyền phê duyệt yêu cầu này');
    }

    await this.twoFactorService.acknowledgePush(userId, deviceInfo.deviceId, pendingToken, approved, signature);
    return { success: true };
  }


  @Public()
  @Get('poll-status')
  @ApiOperation({ summary: 'Poll the status of a PUSH challenge (for Web)' })
  async getPollStatus(@Query('pendingToken') pendingToken: string) {
    if (!pendingToken) throw new BadRequestException('pendingToken is required');
    return this.twoFactorService.getPollingStatus(pendingToken);
  }
}
