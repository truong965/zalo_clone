import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DeviceListItemDto {
  @ApiProperty({ description: 'Unique device ID' })
  deviceId: string;

  @ApiProperty({
    description: 'Human-readable device name',
    example: 'Chrome Windows',
  })
  deviceName: string;

  @ApiProperty({ description: 'Device platform', example: 'WEB' })
  platform: string;

  @ApiProperty({ description: 'How the device logged in', example: 'PASSWORD' })
  loginMethod: string;

  @ApiPropertyOptional({ description: 'Last activity timestamp' })
  lastUsedAt?: Date;

  @ApiProperty({ description: 'IP address used during login' })
  ipAddress: string;

  @ApiPropertyOptional({ description: 'Resolved location (e.g., City, Country)' })
  location?: string;

  @ApiPropertyOptional({ description: 'Browser name' })
  browser?: string;

  @ApiPropertyOptional({ description: 'Operating System' })
  os?: string;

  @ApiProperty({ description: 'Whether the device is a trusted device for 2FA bypass' })
  isTrusted: boolean;

  @ApiProperty({ description: 'Whether the device is currently online' })
  isOnline: boolean;
}
