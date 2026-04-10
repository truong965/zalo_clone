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

  @ApiPropertyOptional({ description: 'Effective last active timestamp from registry' })
  lastActiveAt?: Date;

  @ApiPropertyOptional({ description: 'Registration timestamp' })
  registeredAt?: Date;

  @ApiProperty({ description: 'IP address used during login' })
  ipAddress: string;

  @ApiPropertyOptional({ description: 'Resolved location (e.g., City, Country)' })
  lastLocation?: string;

  @ApiPropertyOptional({ description: 'Browser Name' })
  browserName?: string;

  @ApiPropertyOptional({ description: 'Browser Version' })
  browserVersion?: string;

  @ApiPropertyOptional({ description: 'OS Name' })
  osName?: string;

  @ApiPropertyOptional({ description: 'OS Version' })
  osVersion?: string;

  @ApiProperty({ description: 'Whether the device is a trusted device for 2FA bypass' })
  isTrusted: boolean;

  @ApiProperty({ description: 'Whether the device is currently online' })
  isOnline: boolean;
}
