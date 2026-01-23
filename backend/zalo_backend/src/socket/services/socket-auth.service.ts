import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';
import { PrismaService } from 'src/database/prisma.service';
import {
  AuthenticatedSocket,
  SocketUserContext,
} from 'src/common/interfaces/socket-client.interface';
// import { User } from '@prisma/client';
import { JwtPayload } from 'src/modules/auth/interfaces/jwt-payload.interface';
import jwtConfig from 'src/config/jwt.config';

@Injectable()
export class SocketAuthService {
  private readonly logger = new Logger(SocketAuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  /**
   * Authenticate socket connection
   */
  async authenticateSocket(
    client: AuthenticatedSocket,
  ): Promise<SocketUserContext | null> {
    try {
      const token = this.extractToken(client);

      if (!token) {
        this.logger.debug(
          `Socket ${client.id}: No authentication token provided`,
        );
        return null;
      }

      // Verify JWT
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.jwtConfiguration.accessToken.secret, // Sử dụng config đã inject
      });

      // Validate token type
      if (payload.type !== 'access') {
        this.logger.debug(`Socket ${client.id}: Invalid token type`);
        return null;
      }

      // Find user
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          phoneNumber: true,
          displayName: true,
          avatarUrl: true,
          status: true,
          passwordVersion: true,
          roleId: true, // Cần cho RBAC (Role-Based Access Control) sau này
          // bio: false,      -> BỎ
          // createdAt: false -> BỎ
          // updatedAt: false -> BỎ
        },
      });

      if (!user) {
        this.logger.warn(`Socket ${client.id}: User not found for token`);
        return null;
      }

      // Check user status
      if (user.status !== 'ACTIVE') {
        this.logger.warn(
          `Socket ${client.id}: User ${user.id} is ${user.status}`,
        );
        return null;
      }

      // Check password version (instant invalidation on password change)
      if (user.passwordVersion !== payload.pwdVer) {
        this.logger.warn(
          `Socket ${client.id}: Password version mismatch for user ${user.id}`,
        );
        return null;
      }

      return user;
    } catch (error) {
      this.logger.debug(
        `Socket ${client.id}: Authentication error:`,
        (error as Error).message,
      );
      return null;
    }
  }

  /**
   * Extract token from socket handshake
   */
  private extractToken(client: AuthenticatedSocket): string | null {
    // Try auth object first (Socket.IO v4 recommended)
    const auth = client.handshake?.auth;
    if (auth && typeof auth.token === 'string') {
      return auth.token;
    }
    // Try Authorization header
    const authHeader = client.handshake?.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try query parameter (fallback, less secure)
    const queryToken = client.handshake?.query?.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }

    return null;
  }
}
