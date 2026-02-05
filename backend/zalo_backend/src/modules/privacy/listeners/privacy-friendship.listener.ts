import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RedisService } from '@modules/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import type { FriendshipAcceptedPayload } from '@shared/events/contracts/friendship-events.contract';
import type { UnfriendedPayload } from '@shared/events/contracts/friendship-events.contract';

/**
 * PrivacyFriendshipListener - PHASE 4
 *
 * Listens to friendship events and invalidates permission caches.
 * Event names per plan: friendship.accepted, friendship.unfriended
 *
 * Payload mapping:
 * - friendship.accepted: user1Id, user2Id (from FriendshipAcceptedPayload)
 * - friendship.unfriended: user1Id, user2Id (from UnfriendedPayload)
 */
@Injectable()
export class PrivacyFriendshipListener {
  private readonly logger = new Logger(PrivacyFriendshipListener.name);

  constructor(private readonly redisService: RedisService) {}

  @OnEvent('friendship.accepted')
  async handleFriendshipAccepted(
    event: FriendshipAcceptedPayload | { user1Id?: string; user2Id?: string },
  ): Promise<void> {
    try {
      const user1Id = event?.user1Id;
      const user2Id = event?.user2Id;

      if (!user1Id || !user2Id) {
        this.logger.warn(
          `[Privacy] Invalid friendship.accepted: missing user1Id/user2Id`,
        );
        return;
      }

      this.logger.debug(
        `[Privacy] friendship.accepted: ${user1Id} <-> ${user2Id}`,
      );
      await this.invalidatePermissionCaches(user1Id, user2Id);
    } catch (error) {
      this.logger.error(`[Privacy] Error handling friendship.accepted:`, error);
    }
  }

  @OnEvent('friendship.unfriended')
  async handleUnfriended(
    event: UnfriendedPayload | { user1Id?: string; user2Id?: string },
  ): Promise<void> {
    try {
      const user1Id = event?.user1Id;
      const user2Id = event?.user2Id;

      if (!user1Id || !user2Id) {
        this.logger.warn(
          `[Privacy] Invalid friendship.unfriended: missing user1Id/user2Id`,
        );
        return;
      }

      this.logger.debug(
        `[Privacy] friendship.unfriended: ${user1Id} and ${user2Id}`,
      );
      await this.invalidatePermissionCaches(user1Id, user2Id);
    } catch (error) {
      this.logger.error(
        `[Privacy] Error handling friendship.unfriended:`,
        error,
      );
    }
  }

  /**
   * Invalidate all permission caches between two users
   */
  private async invalidatePermissionCaches(
    userId1: string,
    userId2: string,
  ): Promise<void> {
    const patterns = [
      RedisKeyBuilder.socialPermission('message', userId1, userId2),
      RedisKeyBuilder.socialPermission('message', userId2, userId1),
      RedisKeyBuilder.socialPermission('call', userId1, userId2),
      RedisKeyBuilder.socialPermission('call', userId2, userId1),
      RedisKeyBuilder.socialPermission('profile', userId1, userId2),
      RedisKeyBuilder.socialPermission('profile', userId2, userId1),
    ];

    for (const key of patterns) {
      try {
        await this.redisService.del(key);
      } catch (err) {
        this.logger.warn(`[Privacy] Failed to delete cache key: ${key}`, err);
      }
    }
  }
}
