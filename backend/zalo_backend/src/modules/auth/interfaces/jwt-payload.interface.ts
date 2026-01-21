export interface JwtPayload {
  sub: string; // User ID
  type: 'access' | 'refresh';
  pwdVer: number; // Password version for instant invalidation
  iat?: number; // Issued at
  exp?: number; // Expiration time
}

export interface JwtRefreshPayload extends JwtPayload {
  type: 'refresh';
  deviceId: string; // Device fingerprint
  tokenId: string; // UserToken ID in database
}
