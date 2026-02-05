import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConversationService } from '../services/conversation.service';

/**
 * PHASE 2: Messaging Block Integration via Events
 *
 * React to block/unblock events and manage conversations.
 * This breaks coupling: MessagingModule ← BlockModule
 *
 * BEFORE: MessagingService @Inject(forwardRef(() => BlockService))
 * AFTER: BlockModule emits events → MessagingBlockListener reacts
 *
 * Event Subscriptions:
 * - user.blocked: Archive conversations with blocked user
 * - user.unblocked: Restore conversations
 *
 * PHASE 3.5: Complete Implementation
 * - Archive direct conversations when blocking
 * - Restore conversations on unblock
 * - Prevents accessing chat history with blocked user
 */
@Injectable()
export class MessagingBlockListener {
  private readonly logger = new Logger(MessagingBlockListener.name);

  constructor(private readonly conversationService: ConversationService) {}

  /**
   * Handle UserBlockedEvent
   * Archive conversations when user is blocked
   *
   * Action: Find direct conversation between blocker and blocked user
   *         Set deletedAt to soft-delete (archive)
   */
  @OnEvent('user.blocked')
  async handleUserBlocked(event: {
    blockerId?: string;
    blockedId?: string;
  }): Promise<void> {
    try {
      const blockerId = event?.blockerId;
      const blockedId = event?.blockedId;

      if (!blockerId || !blockedId) {
        this.logger.warn(
          `[Messaging] Invalid block event data: ${JSON.stringify(event)}`,
        );
        return;
      }

      this.logger.debug(`[Messaging] User ${blockerId} blocked ${blockedId}`);

      // PHASE 3.5: Archive direct conversation
      const conversation =
        await this.conversationService.findDirectConversation(
          blockerId,
          blockedId,
        );

      if (conversation) {
        await this.conversationService.archiveDirectConversation(
          conversation.id,
        );
        this.logger.log(
          `[Messaging] ✅ Archived conversation ${conversation.id} (block event)`,
        );
      } else {
        this.logger.debug(
          `[Messaging] No direct conversation found between ${blockerId} and ${blockedId}`,
        );
      }

      this.logger.debug(`[Messaging] Processed block event for users`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[Messaging] Error handling block: ${err?.message || String(error)}`,
        err?.stack,
      );
      // Don't throw - we want to continue even if this fails
    }
  }

  /**
   * Handle UserUnblockedEvent
   * Restore conversations when user is unblocked
   *
   * Action: Find direct conversation between unblocker and unblocked user
   *         Clear deletedAt to restore
   */
  @OnEvent('user.unblocked')
  async handleUserUnblocked(event: {
    blockerId?: string;
    blockedId?: string;
  }): Promise<void> {
    try {
      const blockerId = event?.blockerId;
      const blockedId = event?.blockedId;

      if (!blockerId || !blockedId) {
        this.logger.warn(
          `[Messaging] Invalid unblock event data: ${JSON.stringify(event)}`,
        );
        return;
      }

      this.logger.debug(`[Messaging] User ${blockerId} unblocked ${blockedId}`);

      // PHASE 3.5: Restore direct conversation
      const conversation =
        await this.conversationService.findDirectConversation(
          blockerId,
          blockedId,
        );

      if (conversation) {
        await this.conversationService.restoreDirectConversation(
          conversation.id,
        );
        this.logger.log(
          `[Messaging] ✅ Restored conversation ${conversation.id} (unblock event)`,
        );
      } else {
        this.logger.debug(
          `[Messaging] No direct conversation found between ${blockerId} and ${blockedId}`,
        );
      }

      this.logger.debug(`[Messaging] Processed unblock event for users`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[Messaging] Error handling unblock: ${err?.message || String(error)}`,
        err?.stack,
      );
      // Don't throw - we want to continue even if this fails
    }
  }
}
