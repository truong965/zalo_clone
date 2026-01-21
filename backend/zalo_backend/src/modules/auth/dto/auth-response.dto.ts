import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description:
      'JWT access token (store in memory, send in Authorization header)',
  })
  accessToken: string;

  @ApiProperty({
    example: 900,
    description: 'Access token expiration time in seconds',
  })
  expiresIn: number;

  @ApiProperty({
    example: 'Bearer',
    description: 'Token type',
  })
  tokenType: string;

  @ApiProperty({
    description: 'User information',
  })
  user: {
    id: string;
    phoneNumber: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
  };
}

export class RefreshTokenResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'New JWT access token',
  })
  accessToken: string;

  @ApiProperty({
    example: 900,
    description: 'Access token expiration time in seconds',
  })
  expiresIn: number;

  @ApiProperty({
    example: 'Bearer',
    description: 'Token type',
  })
  tokenType: string;
}
