import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { ConfigType } from '@nestjs/config';
import jwtConfig from '../../../config/jwt.config';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { PrismaService } from 'src/database/prisma.service';
import { User, UserStatus } from '@prisma/client';
import { UserEntity } from 'src/modules/users/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    private readonly prisma: PrismaService,
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

    // Find user
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
    return new UserEntity(user);
  }
}
