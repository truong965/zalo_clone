import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IdempotentListener } from 'src/shared/events/base/idempotent-listener';

/**
 * PHASE 2: Messaging Friendship Integration via Events
 *
 * React to friendship events and manage conversations.
 * This breaks coupling: MessagingModule ← SocialModule
 *
 * BEFORE: ConversationService @Inject(forwardRef(() => SocialService))
 * AFTER: SocialModule emits events → MessagingFriendshipListener reacts
 *
 * Event Subscriptions:
 * - friend_request.accepted: Create DM conversation
 * - unfriended: Archive DM conversation
 * - friend_request.rejected: No action (they never were friends)
 * - friend_request.sent: Monitor (wait for acceptance)
 *
 * NOTE: Conversation creation/archiving logic deferred to PHASE 3
 * Currently just tracks events for monitoring
 */
@Injectable()
export class MessagingFriendshipListener extends IdempotentListener {
  /**
   * Handle FriendRequestAcceptedEvent
   * Create or reactivate DM conversation when friendship is accepted
   */
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

          // TODO PHASE 3: Create/reactivate DM conversation
          // - Check if DIRECT conversation already exists
          // - If yes and archived: unarchive it
          // - If no: create new conversation
          // - Add both users as participants

          this.logger.debug(`[Messaging] Processed friend acceptance`);
        } catch (error) {
          const err = error;
          this.logger.error(
            `[Messaging] Error handling friend acceptance: ${err?.message || String(error)}`,
            err?.stack,
          );
          throw error;
        }
      },
    );
  }

  /**
   * Handle UnfriendedEvent
   * Archive conversation when friendship is removed
   */
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

          // TODO PHASE 3: Archive conversation
          // - Find DIRECT conversation between users
          // - Mark as archived (set archived_at timestamp)
          // - Preserve conversation history

          this.logger.debug(`[Messaging] Processed unfriend event`);
        } catch (error) {
          const err = error;
          this.logger.error(
            `[Messaging] Error handling unfriended: ${err?.message || String(error)}`,
            err?.stack,
          );
          throw error;
        }
      },
    );
  }

  /**
   * Handle FriendRequestRejectedEvent
   * No conversation action needed (never were friends)
   */
  @OnEvent('friend_request.rejected')
  async handleFriendRequestRejected(event: any): Promise<void> {
    await this.withIdempotency(
      `rejected-${event?.requesterId}-${event?.toUserId}`,
      async () => {
        this.logger.debug(
          `[Messaging] Friend request rejected - no action needed`,
        );
        // No conversation to manage (they never were friends)
      },
    );
  }

  /**
   * Handle FriendRequestSentEvent
   * Monitor request (wait for acceptance before creating conversation)
   */
  @OnEvent('friend_request.sent')
  async handleFriendRequestSent(event: any): Promise<void> {
    await this.withIdempotency(
      `sent-${event?.requesterId}-${event?.toUserId}`,
      async () => {
        this.logger.debug(
          `[Messaging] Friend request sent - awaiting acceptance`,
        );
        // Don't create conversation yet
      },
    );
  }
}
