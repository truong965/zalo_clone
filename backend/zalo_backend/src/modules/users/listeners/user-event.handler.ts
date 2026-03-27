import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from 'src/database/prisma.service';
import { InternalEventNames } from 'src/common/contracts/events/event-names';
import type { MediaAvatarUploadInitiatedPayload } from 'src/common/contracts/events/event-contracts';
import { RedisService } from '@shared/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';

@Injectable()
export class UserEventHandler {
  private readonly logger = new Logger(UserEventHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @OnEvent(InternalEventNames.MEDIA_AVATAR_UPLOAD_INITIATED)
  async handleAvatarUploadInitiated(
    payload: MediaAvatarUploadInitiatedPayload,
  ): Promise<void> {
    if (payload.targetType !== 'USER') return;

    const { targetId, avatarUrl } = payload;

    try {
      this.logger.log(`Updating avatar for user ${targetId} to ${avatarUrl}`);

      await this.prisma.user.update({
        where: { id: targetId },
        data: { avatarUrl },
      });

      // Invalidate JWT profile cache
      await this.redis.del(RedisKeyBuilder.authUserProfile(targetId));

      this.logger.debug(`Successfully updated avatar for user ${targetId}`);
    } catch (error) {
      this.logger.error(
        `Failed to update avatar for user ${targetId}: ${error.message}`,
        error.stack,
      );
    }
  }
}
