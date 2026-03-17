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

  @ApiProperty({ description: 'Whether the device is currently online' })
  isOnline: boolean;
}
