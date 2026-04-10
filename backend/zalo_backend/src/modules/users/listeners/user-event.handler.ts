import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from 'src/database/prisma.service';
import { InternalEventNames } from 'src/common/contracts/events/event-names';
import type { MediaAvatarUploadInitiatedPayload } from 'src/common/contracts/events/event-contracts';
import { RedisService } from '@shared/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { OUTBOUND_SOCKET_EVENT, type ISocketEmitEvent } from 'src/common/events/outbound-socket.event';
import { UserEmailUpdatedEvent } from '../events/user.events';

@Injectable()
export class UserEventHandler {
  private readonly logger = new Logger(UserEventHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
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

  @OnEvent(InternalEventNames.USER_EMAIL_UPDATED)
  async handleUserEmailUpdated(event: UserEmailUpdatedEvent): Promise<void> {
    const { userId, newEmail } = event;

    this.logger.log(`[UserSync] Email updated for user ${userId}. Broadcasting sync...`);

    try {
      // 1. Send sync signal to all user's active sockets
      const socketPayload: ISocketEmitEvent = {
        userId,
        event: SocketEvents.ACCOUNT_EMAIL_UPDATED,
        data: { newEmail },
      };

      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, socketPayload);

      this.logger.debug(`[UserSync] Sync event emitted for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `[UserSync] Failed to broadcast email update for ${userId}: ${error.message}`,
      );
    }
  }
}
