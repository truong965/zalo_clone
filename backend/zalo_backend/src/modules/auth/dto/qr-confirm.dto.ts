import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class QrConfirmDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'QR Session ID to confirm approval',
  })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  qrSessionId: string;
}
