/**
 * DeviceTokenController — REST API for push notification device registration.
 *
 * Endpoints:
 *   POST   /api/v1/devices         — register / update FCM token
 *   DELETE /api/v1/devices/:deviceId — remove device (e.g. on logout)
 *
 * All endpoints require JWT authentication (global JwtAuthGuard).
 *
 * Note: main.ts already sets global prefix 'api' + version 'v1',
 * so the controller path must be just 'devices' (not 'api/v1/devices').
 */

import {
  Controller,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  CurrentUser,
  GetDeviceInfo,
} from 'src/common/decorator/customize';
import { DeviceTokenService } from '../services/device-token.service';
import type { DeviceInfo } from 'src/modules/auth/interfaces/device-info.interface';
import { DeviceFingerprintInterceptor } from 'src/common/interceptor/device-fingerprint.interceptor';
import { RegisterDeviceTokenDto } from '../dto/register-device-token.dto';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
@UseInterceptors(DeviceFingerprintInterceptor)
export class DeviceTokenController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register or update FCM push token' })
  async registerToken(
    @CurrentUser('id') userId: string,
    @GetDeviceInfo() deviceInfo: DeviceInfo,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    await this.deviceTokenService.registerToken({
      userId,
      deviceId: deviceInfo.deviceId, // CRITICAL: Use trusted deviceId from header
      deviceName: deviceInfo.deviceName,
      fcmToken: dto.fcmToken,
      platform: dto.platform,
    });

    return { message: 'Device token registered' };
  }

  @Delete(':deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove device (e.g. on logout)' })
  async removeToken(
    @CurrentUser('id') userId: string,
    @Param('deviceId') deviceId: string,
  ) {
    await this.deviceTokenService.removeToken(userId, deviceId);
  }
}
