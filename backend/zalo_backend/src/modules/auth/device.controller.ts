import { Controller, Get, Patch, Delete, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DeviceService } from './services/device.service';
import { DeviceRegistryItemDto } from './dto/device-registry-item.dto';
import { CurrentUser } from 'src/common/decorator/customize';

@ApiTags('Device Management')
@ApiBearerAuth()
@Controller('auth/devices')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Get()
  @ApiOperation({ summary: 'Get all registered devices of the current user' })
  @ApiResponse({ status: 200, type: [DeviceRegistryItemDto] })
  async getDevices(@CurrentUser('id') userId: string): Promise<DeviceRegistryItemDto[]> {
    return this.deviceService.getDevices(userId);
  }

  @Patch(':deviceId/trust')
  @ApiOperation({ summary: 'Trust a specific device for 2FA bypass' })
  async trustDevice(
    @CurrentUser('id') userId: string,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    return this.deviceService.trustDevice(userId, deviceId);
  }

  @Patch(':deviceId/untrust')
  @ApiOperation({ summary: 'Untrust a specific device (will require 2FA next time)' })
  async untrustDevice(
    @CurrentUser('id') userId: string,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    return this.deviceService.untrustDevice(userId, deviceId);
  }

  @Delete(':deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a device and revoke all its active sessions' })
  async removeDevice(
    @CurrentUser('id') userId: string,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    return this.deviceService.removeDevice(userId, deviceId);
  }
}
