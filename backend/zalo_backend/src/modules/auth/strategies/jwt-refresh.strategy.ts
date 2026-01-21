import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { ConfigType } from '@nestjs/config';
import { Request } from 'express';
import jwtConfig from '../../../config/jwt.config';
import { JwtRefreshPayload } from '../interfaces/jwt-payload.interface';

/**
 * Strategy to extract and validate refresh token from HttpOnly cookie
 */
export interface RefreshTokenUser {
  userId: string;
  tokenId: string;
  deviceId: string;
  refreshToken: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {
    super({
      jwtFromRequest: (req: Request) => {
        // Extract refresh token from HttpOnly cookie
        const cookies = req?.cookies as Record<string, string>;
        const token = cookies?.[jwtConfiguration.refreshToken.cookieName];
        // const token = req?.cookies?.[jwtConfiguration.refreshToken.cookieName];
        if (!token) {
          throw new UnauthorizedException('Refresh token not found');
        }
        return token;
      },
      ignoreExpiration: false,
      secretOrKey: jwtConfiguration.refreshToken.secret,
      passReqToCallback: true, // Pass request to validate method
    });
  }

  /**
   * Validate refresh token payload
   * Note: Full validation happens in TokenService.rotateRefreshToken
   */
  validate(req: Request, payload: JwtRefreshPayload): RefreshTokenUser {
    // Validate token type
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Extract refresh token from cookie for rotation
    const cookies = req.cookies as Record<string, string>;
    const refreshToken = cookies[this.jwtConfiguration.refreshToken.cookieName];
    // Attach to request for controller
    return {
      userId: payload.sub,
      tokenId: payload.tokenId,
      deviceId: payload.deviceId,
      refreshToken, // Pass token for rotation
    };
  }
}
