export interface JwtPayload {
  sub: string; // User ID
  type: 'access' | 'refresh';
  pwdVer: number; // Password version for instant invalidation
  sid?: string; // UserToken ID (session binding for access token)
  deviceId?: string; // Device fingerprint bound to this access token
  iat?: number; // Issued at
  exp?: number; // Expiration time
}

export interface JwtRefreshPayload extends JwtPayload {
  type: 'refresh';
  deviceId: string; // Device fingerprint
  tokenId: string; // UserToken ID in database
}
