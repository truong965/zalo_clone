import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ConfigType } from '@nestjs/config';
import jwtConfig from 'src/config/jwt.config';
import ms, { StringValue } from 'ms';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { Public, CurrentUser } from 'src/common/decorator/customize';
import { QrLoginService } from './services/qr-login.service';
import { DeviceFingerprintService } from './services/device-fingerprint.service';
import { QrScanDto } from './dto/qr-scan.dto';
import { QrConfirmDto } from './dto/qr-confirm.dto';
import { QrExchangeDto } from './dto/qr-exchange.dto';
import {
  QrGenerateResponseDto,
  QrScanResponseDto,
  QrStatusResponseDto,
} from './dto/qr-response.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { User } from '@prisma/client';

@ApiTags('QR Login')
@Controller('auth/qr')
export class QrLoginController {
  constructor(
    private readonly qrLoginService: QrLoginService,
    private readonly deviceFingerprintService: DeviceFingerprintService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  /**
   * Pha 1: Web yêu cầu tạo QR session mới
   */
  @Public()
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate new QR login session (Web)' })
  @ApiResponse({ status: 200, type: QrGenerateResponseDto })
  async generate(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('socketId') webSocketId: string, // Client must pass its socketId
  ): Promise<QrGenerateResponseDto> {
    if (!webSocketId) {
      throw new BadRequestException('webSocketId is required');
    }
    return this.qrLoginService.generate(req, res, webSocketId);
  }

  /**
   * Pha 2: Mobile quét QR code
   * Yêu cầu: Bearer Token của thiết bị Mobile đang active
   */
  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mobile scans the QR code' })
  @ApiResponse({ status: 200, type: QrScanResponseDto })
  async scan(
    @CurrentUser() user: User,
    @Body() dto: QrScanDto,
    @Req() req: Request,
  ): Promise<QrScanResponseDto> {
    const mobileDeviceId =
      (user as any).currentDeviceId ||
      this.deviceFingerprintService.extractDeviceInfo(req).deviceId;

    return this.qrLoginService.scan(dto.qrSessionId, user.id, mobileDeviceId);
  }

  /**
   * Pha 2b: Mobile hủy quét QR (khi nhấn "Quét mã khác")
   * Yêu cầu: Bearer Token của thiết bị Mobile đang active
   */
  @Post('cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mobile cancels the QR scan' })
  @ApiResponse({ status: 204, description: 'Cancelled' })
  async cancel(
    @CurrentUser() user: User,
    @Body() dto: QrScanDto,
  ): Promise<void> {
    await this.qrLoginService.cancel(dto.qrSessionId, user.id);
  }

  /**
   * Pha 3a: Mobile xác nhận đăng nhập (Chỉ dùng khi Untrusted)
   * Yêu cầu: Bearer Token của thiết bị Mobile đang active
   */
  @Post('confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mobile confirms the login (Untrusted device)' })
  @ApiResponse({ status: 204, description: 'Approved' })
  async confirm(
    @CurrentUser() user: User,
    @Body() dto: QrConfirmDto,
  ): Promise<void> {
    await this.qrLoginService.confirm(dto.qrSessionId, user.id);
  }

  /**
   * Pha 3b: Web dùng ticket đổi lấy token
   * Rate limiting (IP + Session) and Audit Logging is handled in QrLoginService
   */
  @Public()
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Web exchanges ticket for tokens' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async exchange(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: QrExchangeDto,
  ): Promise<Omit<AuthResponseDto, 'user'>> {
    const result = await this.qrLoginService.exchange(dto, req, res);

    // Set refresh token cookie (same logic as normal login)
    const cookieOptions = {
      ...this.jwtConfiguration.refreshToken.cookieOptions,
      maxAge: ms(
        this.jwtConfiguration.refreshToken.cookieOptions.maxAge as StringValue,
      ),
    };

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

  /**
   * Fallback Polling: Web gọi để kiểm tra status nếu Socket bị rớt
   */
  @Public()
  @Get('status/:qrSessionId')
  @ApiOperation({ summary: 'Poll QR session status (Fallback)' })
  @ApiResponse({ status: 200, type: QrStatusResponseDto })
  async getStatus(
    @Param('qrSessionId') qrSessionId: string,
  ): Promise<QrStatusResponseDto> {
    return this.qrLoginService.getStatus(qrSessionId);
  }
}
