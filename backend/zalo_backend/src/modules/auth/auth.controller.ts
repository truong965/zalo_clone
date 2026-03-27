import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
  Inject,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { DeviceFingerprintService } from './services/device-fingerprint.service';
import { LoginDto } from './dto/login.dto';
import {
  AuthResponseDto,
  RefreshTokenResponseDto,
} from './dto/auth-response.dto';
import { DeviceListItemDto } from './dto/device-list.dto';

import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import type { User } from '@prisma/client';
import jwtConfig from '../../config/jwt.config';
import {
  CurrentUser,
  Public,
  ResponseMessage,
} from 'src/common/decorator/customize';
import ms, { StringValue } from 'ms';
import { CreateUserDto } from '../users/dto/create-user.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyOtpDto,
} from './dto/forgot-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly deviceFingerprintService: DeviceFingerprintService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  @Public()
  @Post('register')
  @ResponseMessage('Register new user')
  register(@Body() createUserDto: CreateUserDto) {
    return this.usersService.register(createUserDto);
  }

  /**
   * Login endpoint
   * Returns access token in response body
   * Sets refresh token as HttpOnly cookie
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<AuthResponseDto, 'user'> & { user: Partial<User> }> {
    // Get or create stable tracking ID
    const trackingId = this.deviceFingerprintService.getOrCreateTrackingId(
      req,
      res,
    );

    // Extract device information
    const deviceInfo = this.deviceFingerprintService.extractDeviceInfo(req);
    // Use the stable tracking ID as the master device ID for the session
    deviceInfo.deviceId = trackingId;

    // Authenticate user
    const result = await this.authService.login(loginDto, deviceInfo);

    const cookieOptions = {
      ...this.jwtConfiguration.refreshToken.cookieOptions,
      maxAge: ms(
        this.jwtConfiguration.refreshToken.cookieOptions.maxAge as StringValue,
      ),
    };
    // Set refresh token as HttpOnly cookie
    res.cookie(
      this.jwtConfiguration.refreshToken.cookieName,
      result.refreshToken,
      cookieOptions,
    );

    // Return access token in response body (DON'T return refresh token)
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      tokenType: result.tokenType,
      user: result.user,
    };
  }

  /**
   * Refresh token endpoint
   * Extracts refresh token from HttpOnly cookie
   * Returns new access token
   * Sets new refresh token as HttpOnly cookie (rotation)
   */
  @Public()
  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: RefreshTokenResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(
    @Req() req: Request & { user: { refreshToken: string } },
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshTokenResponseDto> {
    // Extract device information
    const deviceInfo = this.deviceFingerprintService.extractDeviceInfo(req);

    // Rotate refresh token
    const result = await this.authService.refreshAccessToken(
      req.user.refreshToken,
      deviceInfo,
    );
    const cookieOptions = {
      ...this.jwtConfiguration.refreshToken.cookieOptions,
      maxAge: ms(
        this.jwtConfiguration.refreshToken.cookieOptions.maxAge as StringValue,
      ),
    };
    // Set new refresh token as HttpOnly cookie
    res.cookie(
      this.jwtConfiguration.refreshToken.cookieName,
      result.refreshToken,
      cookieOptions,
    );

    // Return new access token
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      tokenType: result.tokenType,
    };
  }

  /**
   * Logout from current device
   * Clears refresh token cookie
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout from current device' })
  @ApiBearerAuth()
  @ApiResponse({ status: 204, description: 'Logout successful' })
  async logout(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const deviceInfo = this.deviceFingerprintService.extractDeviceInfo(req);
    const targetDeviceId =
      (user as User & { currentDeviceId?: string }).currentDeviceId ||
      deviceInfo.deviceId;

    // Revoke current device session
    await this.authService.logout(user.id, targetDeviceId);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { maxAge, ...options } =
      this.jwtConfiguration.refreshToken.cookieOptions;
    // Clear refresh token cookie
    res.clearCookie(this.jwtConfiguration.refreshToken.cookieName, options);
  }

  /**
   * Get current user profile
   */
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  async getProfile(@CurrentUser() user: User) {
    return this.usersService.getProfile(user.id);
  }

  /**
   * Get all active sessions for current user
   */
  @Get('sessions')
  @ApiOperation({ summary: 'Get all active sessions' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, type: [DeviceListItemDto] })
  async getSessions(@CurrentUser() user: User): Promise<DeviceListItemDto[]> {
    return this.authService.getSessions(user.id);
  }

  /**
   * Revoke specific device session (remote logout)
   */
  @Delete('sessions/:deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke session for specific device' })
  @ApiBearerAuth()
  @ApiResponse({ status: 204, description: 'Session revoked successfully' })
  async revokeSession(
    @CurrentUser() user: User,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    await this.authService.revokeSession(user.id, deviceId);
  }

  /**
   * Request OTP for password reset
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP for password reset' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  /**
   * Verify OTP code
   */
  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP code' })
  @ApiResponse({ status: 200, description: 'OTP is valid' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto);
  }

  /**
   * Reset password using OTP
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using OTP' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const trackingId = this.deviceFingerprintService.getOrCreateTrackingId(
      req,
      res,
    );
    const deviceInfo = this.deviceFingerprintService.extractDeviceInfo(req);
    deviceInfo.deviceId = trackingId;

    const result = await this.authService.resetPassword(
      resetPasswordDto,
      deviceInfo,
    );

    const cookieOptions = {
      ...this.jwtConfiguration.refreshToken.cookieOptions,
      maxAge: ms(
        this.jwtConfiguration.refreshToken.cookieOptions.maxAge as StringValue,
      ),
    };
    res.cookie(
      this.jwtConfiguration.refreshToken.cookieName,
      result.data.refreshToken,
      cookieOptions,
    );

    return {
      message: result.message,
      accessToken: result.data.accessToken,
      expiresIn: result.data.expiresIn,
    };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password for authenticated user' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid old password' })
  async changePassword(
    @CurrentUser() user: User,
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const trackingId = this.deviceFingerprintService.getOrCreateTrackingId(
      req,
      res,
    );
    const deviceInfo = this.deviceFingerprintService.extractDeviceInfo(req);
    deviceInfo.deviceId = trackingId;

    const result = await this.authService.changePassword(
      user.id,
      changePasswordDto,
      deviceInfo,
    );

    const cookieOptions = {
      ...this.jwtConfiguration.refreshToken.cookieOptions,
      maxAge: ms(
        this.jwtConfiguration.refreshToken.cookieOptions.maxAge as StringValue,
      ),
    };
    res.cookie(
      this.jwtConfiguration.refreshToken.cookieName,
      result.data.refreshToken,
      cookieOptions,
    );

    return {
      message: result.message,
      accessToken: result.data.accessToken,
      expiresIn: result.data.expiresIn,
    };
  }
}
