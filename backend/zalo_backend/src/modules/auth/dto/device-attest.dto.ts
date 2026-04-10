import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeviceAttestVerifyDto {
  @ApiProperty({ example: 'nonce_string_from_challenge_endpoint' })
  @IsString()
  @IsNotEmpty()
  challenge: string;

  @ApiProperty({ description: 'DER-encoded hex string of the ECDSA signature' })
  @IsString()
  @IsNotEmpty()
  signature: string;
}
