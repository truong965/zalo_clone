import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IdempotentListener } from 'src/shared/events/base/idempotent-listener';

@Injectable()
export class MessagingFriendshipListener extends IdempotentListener {
  @OnEvent('friend_request.accepted')
  async handleFriendRequestAccepted(event: any): Promise<void> {
    await this.withIdempotency(
      `friend-accepted-${event?.requesterId}-${event?.acceptedBy}`,
      async () => {
        try {
          const requesterId = event?.requesterId;
          const acceptedBy = event?.acceptedBy;

          this.logger.debug(
            `[Messaging] Friend request accepted: ${requesterId} <-> ${acceptedBy}`,
          );

          this.logger.debug(`[Messaging] Processed friend acceptance`);
        } catch (error) {
          const err = error as Error;
          this.logger.error(
            `[Messaging] Error handling friend acceptance: ${err?.message || String(error)}`,
            err?.stack,
          );
          throw error;
        }
      },
    );
  }

  @OnEvent('unfriended')
  async handleUnfriended(event: any): Promise<void> {
    await this.withIdempotency(
      `unfriended-${event?.user1Id}-${event?.user2Id}`,
      async () => {
        try {
          const user1Id = event?.user1Id;
          const user2Id = event?.user2Id;

          this.logger.debug(
            `[Messaging] Unfriended: ${user1Id} <-> ${user2Id}`,
          );

          this.logger.debug(`[Messaging] Processed unfriend event`);
        } catch (error) {
          const err = error as Error;
          this.logger.error(
            `[Messaging] Error handling unfriended: ${err?.message || String(error)}`,
            err?.stack,
          );
          throw error;
        }
      },
    );
  }

  @OnEvent('friend_request.rejected')
  async handleFriendRequestRejected(event: any): Promise<void> {
    await this.withIdempotency(
      `rejected-${event?.requesterId}-${event?.toUserId}`,
      async () => {
        this.logger.debug(
          `[Messaging] Friend request rejected - no action needed`,
        );
      },
    );
  }

  @OnEvent('friend_request.sent')
  async handleFriendRequestSent(event: any): Promise<void> {
    await this.withIdempotency(
      `sent-${event?.requesterId}-${event?.toUserId}`,
      async () => {
        this.logger.debug(
          `[Messaging] Friend request sent - awaiting acceptance`,
        );
      },
    );
  }
}
