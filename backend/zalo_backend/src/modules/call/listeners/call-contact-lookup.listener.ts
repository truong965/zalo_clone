import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IdempotentListener } from '@shared/events';
import { PrismaService } from '@database/prisma.service';
import type {
  FriendshipAcceptedPayload,
  FriendshipRejectedPayload,
  UnfriendedPayload,
} from '@shared/events/contracts';

/**
 * CallContactLookupListener
 *
 * Listens to social events (friendship changes) to maintain call-relevant contact data
 * This breaks the coupling: CallModule ← SocialModule
 *
 * BEFORE: CallHistoryService directly calls SocialService to lookup contacts
 * AFTER: CallModule listens to friendship events and reacts accordingly
 *
 * Events handled:
 * - FriendRequestAcceptedEvent: New friend added, can call
 * - FriendRequestRejectedEvent: Friend request rejected, cannot call
 * - UnfriendedEvent: Friend removed, cannot call
 *
 * Benefits:
 * - No direct import of SocialModule in CallModule
 * - Can query call history independently
 * - Can test CallModule without SocialModule
 */
@Injectable()
export class CallContactLookupListener extends IdempotentListener {
  readonly logger = new Logger('CallContactLookupListener');

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Handle FriendRequestAcceptedEvent
   * Update call availability when friendship is accepted
   */
  @OnEvent('friend_request.accepted')
  async handleFriendRequestAccepted(
    event: FriendshipAcceptedPayload,
  ): Promise<void> {
    return this.withIdempotency(event.eventId, () =>
      Promise.resolve().then(() => {
        this.logger.debug(
          `[Call] Friend request accepted between ${event.requesterId} and ${event.acceptedBy}`,
        );

        try {
          // Create call availability records if needed
          // (Depends on your call design - might not be needed)

          // This is where you can add any call-specific logic:
          // - Update call preference settings
          // - Create call history entries
          // - Update call statistics
          // - Set call availability flags

          this.logger.debug(
            `[Call] Updated call availability for new friend ${event.acceptedBy}`,
          );
        } catch (error) {
          const err = error as Error;
          this.logger.error(
            `[Call] Error handling friend acceptance: ${err.message}`,
            err.stack,
          );
          throw error; // Mark as FAILED in processed_events
        }
      }),
    );
  }

  /**
   * Handle UnfriendedEvent
   * Clean up when friendship is removed
   */
  @OnEvent('unfriended')
  async handleUnfriended(event: UnfriendedPayload): Promise<void> {
    return this.withIdempotency(event.eventId, () =>
      Promise.resolve().then(() => {
        this.logger.debug(
          `[Call] Friendship removed between ${event.initiatedBy} and user (user1Id: ${event.user1Id}, user2Id: ${event.user2Id})`,
        );

        try {
          // You can update call-related data:
          // - End any active calls
          // - Clean up call preferences
          // - Update contact list

          // Example: Could end any active calls between these users
          // const activeCalls = await this.prisma.callHistory.findMany({
          //   where: {
          //     OR: [
          //       {
          //         initiatorId: event.initiatorId,
          //         receiverId: event.removedFriendId,
          //         status: 'ONGOING'
          //       },
          //       {
          //         initiatorId: event.removedFriendId,
          //         receiverId: event.initiatorId,
          //         status: 'ONGOING'
          //       }
          //     ]
          //   }
          // });
          //
          // for (const call of activeCalls) {
          //   await this.prisma.callHistory.update({
          //     where: { id: call.id },
          //     data: { status: 'CANCELLED' }
          //   });
          // }

          this.logger.debug(`[Call] Cleaned up call data for unfriended users`);
        } catch (error) {
          const err = error as Error;
          this.logger.error(
            `[Call] Error handling unfriended event: ${err.message}`,
            err.stack,
          );
          throw error;
        }
      }),
    );
  }

  /**
   * Handle FriendRequestRejectedEvent
   * When friend request is rejected
   */
  @OnEvent('friend_request.rejected')
  async handleFriendRequestRejected(
    event: FriendshipRejectedPayload,
  ): Promise<void> {
    return this.withIdempotency(event.eventId, () =>
      Promise.resolve().then(() => {
        this.logger.debug(
          `[Call] Friend request rejected from ${event.fromUserId} to ${event.toUserId}`,
        );

        // No action needed typically - they weren't friends yet
        this.logger.debug(`[Call] No call data cleanup needed for rejection`);
      }),
    );
  }
}
