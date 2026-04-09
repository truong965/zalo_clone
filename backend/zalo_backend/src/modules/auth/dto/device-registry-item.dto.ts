import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DeviceRegistryItemDto {
  @ApiProperty({ description: 'Unique device ID' })
  deviceId: string;

  @ApiProperty({ description: 'Human-readable device name' })
  deviceName: string;

  @ApiProperty({ description: 'Device Type (WEB/MOBILE/DESKTOP)' })
  deviceType: string;

  @ApiProperty({ description: 'Platform' })
  platform: string;

  @ApiPropertyOptional()
  browser?: string;

  @ApiPropertyOptional()
  os?: string;

  @ApiPropertyOptional()
  lastIp?: string;

  @ApiPropertyOptional()
  lastLocation?: string;

  @ApiProperty({ description: 'Whether the device is a trusted device' })
  isTrusted: boolean;

  @ApiPropertyOptional()
  trustedAt?: Date;

  @ApiProperty({ description: 'Last active timestamp' })
  lastActiveAt: Date;

  @ApiProperty({ description: 'First registration timestamp' })
  registeredAt: Date;

  @ApiProperty({ description: 'Whether it has an active access token session currently' })
  hasActiveSession: boolean;

  @ApiProperty({ description: 'Whether it is online via websocket' })
  isOnline: boolean;
}
