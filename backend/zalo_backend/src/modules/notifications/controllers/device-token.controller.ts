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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorator/customize';
import { DeviceTokenService } from '../services/device-token.service';
import { RegisterDeviceTokenDto } from '../dto/register-device-token.dto';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
export class DeviceTokenController {
      constructor(private readonly deviceTokenService: DeviceTokenService) { }

      @Post()
      @HttpCode(HttpStatus.OK)
      @ApiOperation({ summary: 'Register or update FCM push token' })
      async registerToken(
            @CurrentUser('id') userId: string,
            @Body() dto: RegisterDeviceTokenDto,
      ) {
            await this.deviceTokenService.registerToken({
                  userId,
                  deviceId: dto.deviceId,
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
