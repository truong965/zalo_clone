/**
 * Block Authorization Helper Service
 *
 * Encapsulates all authorization checks for block operations
 * Separate from business logic to maintain clean architecture
 *
 * WHY THIS IS CREATED (Not violating event-driven):
 * - Auth checks are STATELESS operations (no side effects, no events)
 * - They run BEFORE any business logic or events
 * - They don't depend on events or cascade operations
 * - They are pure validation helpers
 * - Having them in a separate service makes code more testable and maintainable
 *
 * Event-driven rule is about BUSINESS OPERATIONS (block/unblock), not AUTH CHECKS
 */

import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { RateLimitException } from '@shared/errors';
import type { BlockConfig } from '../config/block.config';

@Injectable()
export class BlockAuthorizationHelper {
  private readonly logger = new Logger(BlockAuthorizationHelper.name);
  private readonly blockConfig: BlockConfig;

  private readonly blockTimestamps = new Map<string, number[]>();
  private readonly unblockTimestamps = new Map<string, number[]>();

  constructor(private readonly configService: ConfigService) {
    this.blockConfig = this.configService.get<BlockConfig>('block')!;
  }

  /**
   * Validate account is active and authorized
   */
  validateAccountActive(
    user: User | null | undefined,
    operation: string,
  ): void {
    if (!user) {
      throw new BadRequestException('User not authenticated');
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException(
        `Your account is ${user.status?.toLowerCase() || 'inactive'}. Cannot perform ${operation} operations.`,
      );
    }

    this.logger.debug(`✅ Account validation passed for user ${user.id}`);
  }

  /**
   * Validate user is not performing action on themselves
   */
  validateNotSelfAction(
    userId: string,
    targetId: string,
    action: string,
  ): void {
    if (userId === targetId) {
      throw new ForbiddenException(`Cannot ${action} yourself`);
    }

    this.logger.debug(`✅ Self-action validation passed for user ${userId}`);
  }

  /**
   * Check and enforce block rate limit
   */
  checkBlockRateLimit(userId: string, maxBlocks?: number): void {
    const limit = maxBlocks ?? this.blockConfig.rateLimit.maxBlocksPerMinute;
    const cleanupThreshold = this.blockConfig.rateLimit.cleanupThreshold;
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    let timestamps = this.blockTimestamps.get(userId) || [];
    timestamps = timestamps.filter((ts) => ts > oneMinuteAgo);

    if (timestamps.length >= limit) {
      const oldestTimestamp = timestamps[0];
      const resetTime = new Date(oldestTimestamp + 60 * 1000);
      const resetInSeconds = Math.ceil((resetTime.getTime() - now) / 1000);

      this.logger.warn(
        `⚠️  Rate limit exceeded for user ${userId}. Blocked count: ${timestamps.length}/${limit}`,
      );

      throw new RateLimitException(
        `Block rate limit exceeded. Maximum ${limit} blocks per minute. Retry after ${resetInSeconds}s.`,
      );
    }

    timestamps.push(now);
    this.blockTimestamps.set(userId, timestamps);
    this.cleanupExpiredEntries(cleanupThreshold, oneMinuteAgo);

    this.logger.debug(
      `✅ Block rate limit check passed for user ${userId}. Blocks this minute: ${timestamps.length}/${limit}`,
    );
  }

  /**
   * Check and enforce unblock rate limit
   */
  checkUnblockRateLimit(userId: string, maxUnblocks?: number): void {
    const limit =
      maxUnblocks ?? this.blockConfig.rateLimit.maxUnblocksPerMinute;
    const cleanupThreshold = this.blockConfig.rateLimit.cleanupThreshold;

    if (!limit) {
      return;
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    let timestamps = this.unblockTimestamps.get(userId) || [];
    timestamps = timestamps.filter((ts) => ts > oneMinuteAgo);

    if (timestamps.length >= limit) {
      const oldestTimestamp = timestamps[0];
      const resetTime = new Date(oldestTimestamp + 60 * 1000);
      const resetInSeconds = Math.ceil((resetTime.getTime() - now) / 1000);

      this.logger.warn(`⚠️  Unblock rate limit exceeded for user ${userId}.`);

      throw new RateLimitException(
        `Unblock rate limit exceeded. Maximum ${limit} unblocks per minute. Retry after ${resetInSeconds}s.`,
      );
    }

    timestamps.push(now);
    this.unblockTimestamps.set(userId, timestamps);
    this.cleanupExpiredEntries(cleanupThreshold, oneMinuteAgo);

    this.logger.debug(`✅ Unblock rate limit check passed for user ${userId}.`);
  }

  /**
   * Combined authorization check for block operations
   */
  validateBlockOperation(
    user: User | null | undefined,
    targetUserId: string,
  ): void {
    this.validateAccountActive(user, 'block');
    this.validateNotSelfAction(user!.id, targetUserId, 'block');
    this.checkBlockRateLimit(user!.id);
  }

  /**
   * Combined authorization check for unblock operations
   */
  validateUnblockOperation(
    user: User | null | undefined,
    targetUserId: string,
  ): void {
    this.validateAccountActive(user, 'unblock');
    this.validateNotSelfAction(user!.id, targetUserId, 'unblock');
    this.checkUnblockRateLimit(user!.id);
  }

  /**
   * Get rate limit status for monitoring
   */
  getRateLimitStatus(userId: string): {
    blockCount: number;
    unblockCount: number;
    maxBlocks: number;
    maxUnblocks: number;
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    const blockCount = (this.blockTimestamps.get(userId) || []).filter(
      (ts) => ts > oneMinuteAgo,
    ).length;

    const unblockCount = (this.unblockTimestamps.get(userId) || []).filter(
      (ts) => ts > oneMinuteAgo,
    ).length;

    return {
      blockCount,
      unblockCount,
      maxBlocks: this.blockConfig.rateLimit.maxBlocksPerMinute,
      maxUnblocks: this.blockConfig.rateLimit.maxUnblocksPerMinute,
    };
  }

  /**
   * Clear all rate limit tracking (for testing)
   */
  clearAllTracking(): void {
    this.blockTimestamps.clear();
    this.unblockTimestamps.clear();
    this.logger.debug('✅ Cleared all rate limit tracking');
  }

  /**
   * Private helper to cleanup expired entries
   */
  private cleanupExpiredEntries(threshold: number, expiryTime: number): void {
    if (this.blockTimestamps.size + this.unblockTimestamps.size > threshold) {
      const keysToDelete: string[] = [];

      for (const [userId, ts] of this.blockTimestamps.entries()) {
        const activeTs = ts.filter((t) => t > expiryTime);
        if (activeTs.length === 0) {
          keysToDelete.push(userId);
        } else {
          this.blockTimestamps.set(userId, activeTs);
        }
      }

      for (const [userId, ts] of this.unblockTimestamps.entries()) {
        const activeTs = ts.filter((t) => t > expiryTime);
        if (activeTs.length === 0) {
          keysToDelete.push(userId);
        } else {
          this.unblockTimestamps.set(userId, activeTs);
        }
      }

      keysToDelete.forEach((k) => {
        this.blockTimestamps.delete(k);
        this.unblockTimestamps.delete(k);
      });

      this.logger.debug(
        `🧹 Cleaned up ${keysToDelete.length} expired rate limit entries`,
      );
    }
  }
}
