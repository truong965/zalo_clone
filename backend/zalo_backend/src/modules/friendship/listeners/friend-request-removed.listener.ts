import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { RedisService } from '@modules/redis/redis.service';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import { FriendshipCacheHelper } from '../helpers/friendship-cache.helper';
import { EventIdGenerator } from '@common/utils/event-id-generator';

/**
 * FriendRequestCancelledListener - PHASE 5
 *
 * Handles: friendship.request.cancelled (per plan)
 * Fired when: User A (requester) cancels their pending request to User B
 *
 * Responsibility: Invalidate recipient's pending requests cache
 */
@Injectable()
export class FriendRequestRemovedListener extends IdempotentListener {
  constructor(
    prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super(prisma);
  }

  @OnEvent('friendship.request.cancelled')
  async handleFriendshipCancelled(payload: {
    eventId?: string;
    cancelledBy?: string;
    targetUserId?: string;
  }): Promise<void> {
    const eventId = payload?.eventId ?? EventIdGenerator.generate();
    const cancelledBy = payload?.cancelledBy;
    const targetUserId = payload?.targetUserId;

    if (!cancelledBy || !targetUserId) {
      this.logger.warn(
        `[FRIENDSHIP_CANCELLED] Invalid payload: missing cancelledBy/targetUserId`,
      );
      return;
    }

    return this.withIdempotency(
      eventId,
      async () => {
        this.logger.log(
          `[FRIENDSHIP_CANCELLED] ${cancelledBy} cancelled request to ${targetUserId}`,
        );

        await FriendshipCacheHelper.invalidatePendingForUser(
          this.redis,
          targetUserId,
        );

        await FriendshipCacheHelper.invalidateForUsers(
          this.redis,
          cancelledBy,
          targetUserId,
        );

        this.logger.debug(
          `[FRIENDSHIP_CANCELLED] ✅ Cache invalidated for ${targetUserId}`,
        );
      },
      'FriendRequestRemovedListener',
    );
  }
}
