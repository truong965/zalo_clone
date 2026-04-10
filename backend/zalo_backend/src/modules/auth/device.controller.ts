import { Controller, Get, Post, Patch, Delete, Param, HttpCode, HttpStatus, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DeviceService } from './services/device.service';
import { DeviceRegistryItemDto } from './dto/device-registry-item.dto';
import { CurrentUser } from 'src/common/decorator/customize';
import { DeviceAttestVerifyDto } from './dto/device-attest.dto';
import { DeviceAttestGuard } from './guards/device-attest.guard';

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

  @Post('attest/challenge')
  @ApiOperation({ summary: 'Generate a random challenge for device attestation' })
  async generateChallenge(@CurrentUser('id') userId: string): Promise<{ challenge: string }> {
    const challenge = await this.deviceService.generateAttestationChallenge(userId);
    return { challenge };
  }

  @Post(':deviceId/attest/verify')
  @ApiOperation({ summary: 'Verify device identity using ECDSA signature' })
  async verifyAttestation(
    @CurrentUser('id') userId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: DeviceAttestVerifyDto,
  ): Promise<{ verified: boolean }> {
    const verified = await this.deviceService.verifyDeviceAttestation(
      userId,
      deviceId,
      dto.challenge,
      dto.signature,
    );
    return { verified };
  }

  @UseGuards(DeviceAttestGuard)
  @Patch(':deviceId/trust')
  @ApiOperation({ summary: 'Trust a specific device for 2FA bypass' })
  async trustDevice(
    @CurrentUser('id') userId: string,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    return this.deviceService.trustDevice(userId, deviceId);
  }

  @UseGuards(DeviceAttestGuard)
  @Patch(':deviceId/untrust')
  @ApiOperation({ summary: 'Untrust a specific device (will require 2FA next time)' })
  async untrustDevice(
    @CurrentUser('id') userId: string,
    @Param('deviceId') deviceId: string,
  ): Promise<void> {
    return this.deviceService.untrustDevice(userId, deviceId);
  }

  @UseGuards(DeviceAttestGuard)
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
