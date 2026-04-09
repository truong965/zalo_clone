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
  UseInterceptors,
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
import { DeviceType } from '@prisma/client';
import type { User } from '@prisma/client'
import jwtConfig from '../../config/jwt.config';
import {
  CurrentUser,
  Public,
  ResponseMessage,
  GetDeviceInfo,
} from 'src/common/decorator/customize';
import type { DeviceInfo } from './interfaces/device-info.interface';
import { DeviceFingerprintInterceptor } from 'src/common/interceptor/device-fingerprint.interceptor';
import ms, { StringValue } from 'ms';
import { CreateUserDto } from '../users/dto/create-user.dto';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/forgot-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestRegisterOtpDto, VerifyRegisterOtpDto } from './dto/register-otp.dto';

@ApiTags('Authentication')
@Controller('auth')
@UseInterceptors(DeviceFingerprintInterceptor)
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
  @ResponseMessage('Đăng ký tài khoản thành công')
  register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Public()
  @Post('register/otp-request')
  @ResponseMessage('Mã OTP đã được gửi')
  requestRegisterOtp(@Body() dto: RequestRegisterOtpDto) {
    return this.authService.requestRegisterOtp(dto);
  }

  @Public()
  @Post('register/otp-verify')
  @ResponseMessage('Xác thực OTP thành công')
  verifyRegisterOtp(@Body() dto: VerifyRegisterOtpDto) {
    return this.authService.verifyRegisterOtp(dto);
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
  @ApiResponse({ status: 202, description: '2FA required' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() loginDto: LoginDto,
    @GetDeviceInfo() deviceInfo: DeviceInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<any> {
    const result = await this.authService.login(loginDto, deviceInfo);

    // Handle 2FA Required
    if (result && 'status' in result && result.status === '2FA_REQUIRED') {
      res.status(HttpStatus.ACCEPTED); // 202
      return result;
    }

    // Standard Login Success
    const cookieOptions = {
      ...this.jwtConfiguration.refreshToken.cookieOptions,
      maxAge: this.jwtConfiguration.refreshToken.cookieOptions.maxAge as number,
    };

    const successResult = result as any;

    if (deviceInfo.deviceType === DeviceType.MOBILE) {
      return {
        accessToken: successResult.accessToken,
        refreshToken: successResult.refreshToken,
        expiresIn: successResult.expiresIn,
        tokenType: successResult.tokenType,
        user: successResult.user,
      };
    } else {
      res.cookie(
        this.jwtConfiguration.refreshToken.cookieName,
        successResult.refreshToken,
        cookieOptions,
      );
      return {
        accessToken: successResult.accessToken,
        expiresIn: successResult.expiresIn,
        tokenType: successResult.tokenType,
        user: successResult.user,
      };
    }
  }

  @Public()
  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(
    @Req() req: Request & { user: { refreshToken: string } },
    @GetDeviceInfo() deviceInfo: DeviceInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<any> {
    const result = await this.authService.refreshAccessToken(req.user.refreshToken, deviceInfo);
    
    const cookieOptions = {
      ...this.jwtConfiguration.refreshToken.cookieOptions,
      maxAge: this.jwtConfiguration.refreshToken.cookieOptions.maxAge as number,
    };

    if (deviceInfo.deviceType === DeviceType.MOBILE) {
      return result;
    } else {
      res.cookie(
        this.jwtConfiguration.refreshToken.cookieName,
        result.refreshToken,
        cookieOptions,
      );
      return {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        tokenType: result.tokenType,
      };
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout from current device' })
  @ApiBearerAuth()
  async logout(
    @CurrentUser() user: User,
    @GetDeviceInfo() deviceInfo: DeviceInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const targetDeviceId = (user as any).currentDeviceId || deviceInfo.deviceId;
    await this.authService.logout(user.id, targetDeviceId);
    const { maxAge, ...options } = this.jwtConfiguration.refreshToken.cookieOptions;
    res.clearCookie(this.jwtConfiguration.refreshToken.cookieName, options);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiBearerAuth()
  async getProfile(@CurrentUser() user: User) {
    return this.usersService.getProfile(user.id);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Get all active sessions' })
  @ApiBearerAuth()
  async getSessions(@CurrentUser() user: User): Promise<DeviceListItemDto[]> {
    return this.authService.getSessions(user.id);
  }

  @Delete('sessions/:deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke session for specific device' })
  @ApiBearerAuth()
  async revokeSession(
    @CurrentUser() user: User,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    await this.authService.revokeSession(user.id, deviceId);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request 2FA challenge for password reset' })
  @ApiResponse({ status: 202, description: '2FA challenge initiated' })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @GetDeviceInfo() deviceInfo: DeviceInfo,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.forgotPassword(forgotPasswordDto, deviceInfo);
    
    if (result && 'status' in result && result.status === '2FA_REQUIRED') {
      res.status(HttpStatus.ACCEPTED);
      return result;
    }
    
    return result;
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using resetToken' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password for authenticated user' })
  @ApiBearerAuth()
  async changePassword(
    @CurrentUser() user: User,
    @Body() changePasswordDto: ChangePasswordDto,
    @GetDeviceInfo() deviceInfo: DeviceInfo,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.changePassword(user.id, changePasswordDto, deviceInfo);

    const cookieOptions = {
      ...this.jwtConfiguration.refreshToken.cookieOptions,
      maxAge: this.jwtConfiguration.refreshToken.cookieOptions.maxAge as number,
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
