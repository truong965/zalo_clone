import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QrExchangeDto {
  @ApiProperty({
    description: 'One-time exchange ticket received via Socket or polling',
  })
  @IsString()
  @IsNotEmpty()
  ticket: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'QR Session ID',
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  qrSessionId: string;

  @ApiProperty({
    description: 'Device tracking ID (from cookie or body)',
  })
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}
