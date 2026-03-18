import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { ConfigType } from '@nestjs/config';
import jwtConfig from '../../../config/jwt.config';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { PrismaService } from 'src/database/prisma.service';
import { User, UserStatus } from '@prisma/client';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { RedisService } from '@shared/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';

const PROFILE_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConfiguration.accessToken.secret,
    });
  }

  /**
   * Validate JWT payload and return user object
   * This runs AFTER JWT signature verification
   */
  async validate(payload: JwtPayload): Promise<User> {
    // Validate token type
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Enforce session binding so revoked device sessions are denied immediately.
    if (!payload.sid || !payload.deviceId) {
      throw new UnauthorizedException('Invalid session token');
    }

    const activeSession = await this.prisma.userToken.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        deviceId: payload.deviceId,
        isRevoked: false,
        expiresAt: { gte: new Date() },
      },
      select: { id: true },
    });

    if (!activeSession) {
      throw new UnauthorizedException('Session revoked. Please login again.');
    }

    const cacheKey = RedisKeyBuilder.authUserProfile(payload.sub);

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const user = JSON.parse(cached) as UserEntity;
      // Validate password version even from cache
      if (user.passwordVersion !== payload.pwdVer) {
        throw new UnauthorizedException(
          'Password changed. Please login again.',
        );
      }
      return user;
    }

    // Cache miss — query DB
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check user status
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        `Account is ${user.status.toLowerCase()}`,
      );
    }

    // ⭐ CRITICAL: Validate password version (instant invalidation)
    if (user.passwordVersion !== payload.pwdVer) {
      throw new UnauthorizedException('Password changed. Please login again.');
    }

    // Attach user to request (remove sensitive data)
    const entity = new UserEntity(user);

    // Attach the current device context specifically for this token's runtime
    entity.currentDeviceId = payload.deviceId;
    entity.currentSessionId = payload.sid;

    // Cache the pristine serialized entity (without the dynamic token context)
    await this.redis.setex(
      cacheKey,
      PROFILE_CACHE_TTL,
      JSON.stringify(new UserEntity(user)),
    );

    return entity;
  }
}
