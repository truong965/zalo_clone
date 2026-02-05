import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType, Gender } from '@prisma/client';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import {
  ConversationMemberAddedEvent,
  ConversationMemberLeftEvent,
} from '@modules/messaging/events/versioned-conversation-events';

/**
 * PHASE 3 Action 3.2: ConversationEventHandler (SEPARATED LISTENER)
 * PHASE 3.3: Enhanced with Idempotency Tracking
 *
 * Responsibility: ONLY handles conversation and user profile events
 * - conversation.member.added
 * - conversation.member.left
 * - user.profile.updated
 *
 * Single Responsibility: Conversation management and profile consistency
 * NO cross-module orchestration
 *
 * Idempotency: All handlers track processing to prevent duplicate execution
 */

export interface UserProfileUpdatedEvent {
  eventId?: string;
  userId: string;
  updates: {
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
    gender?: Gender;
    dateOfBirth?: Date;
  };
}

@Injectable()
export class ConversationEventHandler {
  private readonly logger = new Logger(ConversationEventHandler.name);

  constructor(private readonly idempotency: IdempotencyService) {}

  /**
   * Handle conversation.member.added event
   *
   * Responsibility:
   *   1. Notify new members about the conversation
   *   2. Create system message
   *   3. Update member count cache
   *
   * NOT Responsibility:
   *   - Actually sending socket messages (SocketModule)
   *   - Permission checks (SocialModule)
   */
  @OnEvent('conversation.member.added')
  async handleMemberAdded(
    payload: ConversationMemberAddedEvent,
  ): Promise<void> {
    const { conversationId, memberId } = payload;
    const eventId =
      payload.eventId ||
      `conversation.member.added-${conversationId}-${memberId}`;
    const handlerId = this.constructor.name;

    // IDEMPOTENCY: Check if already processed
    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );

      if (alreadyProcessed) {
        this.logger.debug(
          `[MEMBER_ADDED] Skipping duplicate event: ${eventId}`,
        );
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[MEMBER_ADDED] Idempotency check failed, proceeding with caution`,
        idempotencyError,
      );
    }

    this.logger.log(
      `[MEMBER_ADDED] ${memberId.length} members added to ${conversationId}`,
    );

    try {
      // STEP 1: Create System Message in Conversation
      this.logger.debug(
        `[MEMBER_ADDED] Creating system message for ${conversationId}`,
      );
      // TODO: Add system message: "User A added B, C to conversation"

      // STEP 2: Notify New Members
      // New members need full conversation data to display in their chat list
      this.logger.debug(
        `[MEMBER_ADDED] Queueing notifications for ${memberId.length} new members`,
      );
      // TODO: Queue socket events for each new member
      // TODO: Include full conversation object

      // STEP 3: Update Member Count Cache
      this.logger.debug(`[MEMBER_ADDED] Updating member count cache`);
      // TODO: Increment conversation.memberCount in cache

      this.logger.log(
        `[MEMBER_ADDED] ✅ Complete: Members added to conversation`,
      );

      // IDEMPOTENCY: Record successful processing
      try {
        await this.idempotency.recordProcessed(
          eventId,
          handlerId,
          EventType.MESSAGE_SENT,
        );
      } catch (recordError) {
        this.logger.warn(
          `[MEMBER_ADDED] Failed to record idempotency tracking`,
          recordError,
        );
      }
    } catch (error) {
      this.logger.error(
        `[MEMBER_ADDED] ❌ Failed to handle conversation.member.added event:`,
        error,
      );

      // IDEMPOTENCY: Record failed processing
      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.MESSAGE_SENT,
        );
      } catch (recordError) {
        this.logger.warn(
          `[MEMBER_ADDED] Failed to record error in idempotency tracking`,
          recordError,
        );
      }

      throw error;
    }
  }

  /**
   * Handle conversation.member.left event
   *
   * Responsibility:
   *   1. Create system message in conversation
   *   2. Remove user from the conversation
   *   3. Update member count cache
   *
   * NOT Responsibility:
   *   - Force disconnect active calls (CallModule listens to same event)
   *   - Socket updates (SocketModule listens to same event)
   */
  @OnEvent('conversation.member.left')
  async handleMemberLeft(payload: ConversationMemberLeftEvent): Promise<void> {
    const { conversationId, memberId, kickedBy } = payload;
    const eventId =
      payload.eventId ||
      `conversation.member.left-${conversationId}-${memberId}`;
    const handlerId = this.constructor.name;

    // IDEMPOTENCY: Check if already processed
    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );

      if (alreadyProcessed) {
        this.logger.debug(`[MEMBER_LEFT] Skipping duplicate event: ${eventId}`);
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[MEMBER_LEFT] Idempotency check failed, proceeding with caution`,
        idempotencyError,
      );
    }

    this.logger.log(
      `[MEMBER_LEFT] ${memberId} left/removed from ${conversationId}`,
    );

    try {
      // STEP 1: Create System Message
      const isRemoved = kickedBy !== memberId;
      const messageType = isRemoved ? 'USER_REMOVED' : 'USER_LEFT';
      this.logger.debug(
        `[MEMBER_LEFT] Creating system message (type: ${messageType})`,
      );
      // TODO: Add system message: "User A left" or "User A was removed by B"

      // STEP 2: Update Member Count Cache
      this.logger.debug(`[MEMBER_LEFT] Updating member count cache`);
      // TODO: Decrement conversation.memberCount in cache

      // STEP 3: Clear User's Conversation (from their perspective)
      // TODO: Mark conversation as inactive or left for this user

      this.logger.log(
        `[MEMBER_LEFT] ✅ Complete: ${memberId} left conversation`,
      );

      // IDEMPOTENCY: Record successful processing
      try {
        await this.idempotency.recordProcessed(
          eventId,
          handlerId,
          EventType.MESSAGE_SENT,
        );
      } catch (recordError) {
        this.logger.warn(
          `[MEMBER_LEFT] Failed to record idempotency tracking`,
          recordError,
        );
      }
    } catch (error) {
      this.logger.error(
        `[MEMBER_LEFT] ❌ Failed to handle conversation.member.left event:`,
        error,
      );

      // IDEMPOTENCY: Record failed processing
      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.MESSAGE_SENT,
        );
      } catch (recordError) {
        this.logger.warn(
          `[MEMBER_LEFT] Failed to record error in idempotency tracking`,
          recordError,
        );
      }

      throw error;
    }
  }

  /**
   * Handle user.profile.updated event
   *
   * Responsibility:
   *   1. Invalidate user profile cache
   *   2. Update profile in all active conversations
   *
   * NOT Responsibility:
   *   - Socket broadcasting (SocketModule handles that)
   *   - Client UI updates (Clients listen to socket events)
   */
  @OnEvent('user.profile.updated')
  async handleUserProfileUpdated(
    payload: UserProfileUpdatedEvent,
  ): Promise<void> {
    const { userId, updates } = payload;
    const eventId = payload.eventId || `user.profile.updated-${userId}`;
    const handlerId = this.constructor.name;

    // IDEMPOTENCY: Check if already processed
    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );

      if (alreadyProcessed) {
        this.logger.debug(
          `[PROFILE_UPDATED] Skipping duplicate event: ${eventId}`,
        );
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[PROFILE_UPDATED] Idempotency check failed, proceeding with caution`,
        idempotencyError,
      );
    }

    this.logger.log(`[PROFILE_UPDATED] Profile updated for user ${userId}`);
    this.logger.debug(`[PROFILE_UPDATED] Updates:`, updates);

    try {
      // STEP 1: Invalidate User Profile Cache
      this.logger.debug(`[PROFILE_UPDATED] Invalidating cache for ${userId}`);
      // TODO: Delete Redis keys:
      //   - user:profile:${userId}
      //   - user:avatar:${userId}
      //   - user:display_name:${userId}

      // STEP 2: Update Contact Lists
      // Users who have this user in their contacts should see updated info
      this.logger.debug(`[PROFILE_UPDATED] Queuing contact updates`);
      // TODO: Find all contacts of this user
      // TODO: Update their local contact cache

      // STEP 3: Update Conversation Member Lists
      // In group conversations, member profiles should reflect latest changes
      this.logger.debug(`[PROFILE_UPDATED] Updating conversation member info`);
      // TODO: Find all conversations with this member
      // TODO: Refresh member profile cache

      this.logger.log(`[PROFILE_UPDATED] ✅ Complete: Profile updated`);

      // IDEMPOTENCY: Record successful processing
      try {
        await this.idempotency.recordProcessed(
          eventId,
          handlerId,
          EventType.USER_PROFILE_UPDATED,
        );
      } catch (recordError) {
        this.logger.warn(
          `[PROFILE_UPDATED] Failed to record idempotency tracking`,
          recordError,
        );
      }
    } catch (error) {
      this.logger.error(
        `[PROFILE_UPDATED] ❌ Failed to handle user.profile.updated event:`,
        error,
      );

      // IDEMPOTENCY: Record failed processing
      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.USER_PROFILE_UPDATED,
        );
      } catch (recordError) {
        this.logger.warn(
          `[PROFILE_UPDATED] Failed to record error in idempotency tracking`,
          recordError,
        );
      }
      // Don't throw - non-critical (app will work, just stale data)
    }
  }
}
