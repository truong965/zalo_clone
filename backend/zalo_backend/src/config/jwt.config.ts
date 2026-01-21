import { registerAs } from '@nestjs/config';
import ms from 'ms';

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
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict' as const,
      path: '/api/v1/auth/refresh', // Only send cookie to refresh endpoint
      maxAge: ms(7 * 24 * 60 * 60), // 7 days in milliseconds
    },
  },
}));
