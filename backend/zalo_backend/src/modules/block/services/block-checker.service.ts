/**
 * BlockCheckerService - Redis read-through block status check
 *
 * PHASE 2: Per plan - Block check via BlockRepository (not Prisma direct).
 * Used by AuthorizationModule (canInteract) and FriendshipModule (friend_request validation).
 *
 * Cache strategy: Read-through
 * 1. Check Redis cache (SOCIAL:BLOCK:{id1}:{id2})
 * 2. On miss: Query IBlockRepository, populate cache
 */

import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from '@modules/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import socialConfig from '@config/social.config';
import type { ConfigType } from '@nestjs/config';
import type { IBlockRepository } from '../repositories/block.repository.interface';
import { BLOCK_REPOSITORY } from '../repositories/block.repository.interface';

@Injectable()
export class BlockCheckerService {
  constructor(
    private readonly redis: RedisService,
    @Inject(BLOCK_REPOSITORY)
    private readonly blockRepository: IBlockRepository,
    @Inject(socialConfig.KEY)
    private readonly config: ConfigType<typeof socialConfig>,
  ) {}

  /**
   * Check if there is a block between two users (either direction).
   */
  async isBlocked(userId1: string, userId2: string): Promise<boolean> {
    const cacheKey = RedisKeyBuilder.socialBlock(userId1, userId2);
    const cached = await this.redis.get(cacheKey);

    if (cached !== null) {
      return cached === '1';
    }

    const exists12 = await this.blockRepository.exists(userId1, userId2);
    const exists21 = await this.blockRepository.exists(userId2, userId1);
    const isBlocked = exists12 || exists21;

    await this.redis.setex(
      cacheKey,
      this.config.ttl.block,
      isBlocked ? '1' : '0',
    );

    return isBlocked;
  }

  /**
   * Check if requester is blocked by target (or vice versa).
   * For interaction authorization, any block between the two users denies access.
   */
  async isBlockedByTarget(
    requesterId: string,
    targetId: string,
  ): Promise<boolean> {
    return this.isBlocked(requesterId, targetId);
  }
}
