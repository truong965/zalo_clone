import {
      IsString,
      IsNotEmpty,
      IsOptional,
      MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Register or update a device's FCM push token.
 * Called from frontend after obtaining the token via Firebase Messaging SDK.
 */
export class RegisterDeviceTokenDto {
      @ApiProperty({
            description: 'Unique device identifier (e.g. browser fingerprint, device UUID)',
            example: 'web-abc123def456',
      })
      @IsString()
      @IsNotEmpty()
      @MaxLength(255)
      deviceId: string;

      @ApiProperty({
            description: 'FCM registration token obtained from Firebase Messaging',
      })
      @IsString()
      @IsNotEmpty()
      fcmToken: string;

      @ApiPropertyOptional({
            description: 'Platform identifier',
            example: 'web',
            enum: ['web', 'android', 'ios'],
      })
      @IsString()
      @IsOptional()
      @MaxLength(20)
      platform?: string;
}
