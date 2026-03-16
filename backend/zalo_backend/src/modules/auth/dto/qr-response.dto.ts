import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QrSessionStatus } from '../services/qr-session-redis.service';

export class QrStatusResponseDto {
  @ApiProperty({
    enum: ['PENDING', 'SCANNED', 'APPROVED', 'EXPIRED', 'CANCELLED'],
    description: 'Current status of the QR session',
  })
  status: QrSessionStatus | 'EXPIRED';

  @ApiPropertyOptional({
    description: 'Exchange ticket — only present when status is APPROVED',
  })
  ticket?: string;
}

export class QrGenerateResponseDto {
  @ApiProperty({
    description: 'QR Session ID to encode in QR code',
  })
  qrSessionId: string;

  @ApiProperty({
    description: 'Device tracking ID for exchange verification',
  })
  deviceTrackingId: string;
}

export class QrScanResponseDto {
  @ApiProperty({
    description: 'Whether confirmation is required (untrusted device)',
  })
  requireConfirm: boolean;

  @ApiPropertyOptional({ description: 'Browser name of the Web client' })
  browser?: string;

  @ApiPropertyOptional({ description: 'Operating system of the Web client' })
  os?: string;

  @ApiPropertyOptional({ description: 'IP address of the Web client' })
  ipAddress?: string;

  @ApiPropertyOptional({ description: 'When the QR session was created' })
  createdAt?: string;
}
