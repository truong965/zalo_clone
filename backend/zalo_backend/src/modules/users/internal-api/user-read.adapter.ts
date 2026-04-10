import { Injectable } from '@nestjs/common';
import { IUserReadPort } from '@common/contracts/internal-api';
import { PrismaService } from 'src/database/prisma.service';
import { UserStatus } from '@prisma/client';
import { RedisService } from '@shared/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class UserReadAdapter implements IUserReadPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Get the current status of a user.
   * Optimized to check auth profile cache first, then narrow DB query.
   */
  async getUserStatus(userId: string): Promise<UserStatus | null> {
    const cacheKey = RedisKeyBuilder.authUserProfile(userId);

    // 1. Try cache (authUserProfile stores the full user object including status)
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        const user = JSON.parse(cached) as UserEntity;
        if (user && user.status) {
          return user.status;
        }
      } catch (error) {
        // Fallback to DB if cache is malformed
      }
    }

    // 2. DB Fallback (Narrow query for performance)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });

    return user?.status ?? null;
  }
}
