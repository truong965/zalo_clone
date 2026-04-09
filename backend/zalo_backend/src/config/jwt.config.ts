import { registerAs } from '@nestjs/config';
import ms, { StringValue } from 'ms';

export default registerAs('jwt', () => ({
  // Access Token Configuration
  accessToken: {
    secret:
      process.env.JWT_ACCESS_SECRET ||
      'access-token-secret-change-in-production',
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  },

  // Refresh Token Configuration
  refreshToken: {
    secret:
      process.env.JWT_REFRESH_SECRET ||
      'refresh-token-secret-change-in-production',
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    cookieName: 'refresh_token',
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
      path: '/', // Broaden path for reliability
      maxAge: ms((process.env.JWT_REFRESH_EXPIRES_IN || '7d') as StringValue), // Returns milliseconds as number
    },
  },
}));
