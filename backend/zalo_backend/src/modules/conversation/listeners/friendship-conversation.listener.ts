/**
 * FriendshipConversationListener
 *
 * Lives in ConversationModule. Listens to `friendship.accepted` and
 * auto-creates a DIRECT conversation between the two users (if one
 * doesn't already exist).
 *
 * Event-driven: FriendshipModule emits → ConversationModule listens.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConversationService } from '../services/conversation.service';
import type { FriendshipAcceptedPayload } from '@shared/events/contracts';

@Injectable()
export class FriendshipConversationListener {
      private readonly logger = new Logger(FriendshipConversationListener.name);

      constructor(private readonly conversationService: ConversationService) { }

      @OnEvent('friendship.accepted', { async: true })
      async handleFriendshipAccepted(
            payload: FriendshipAcceptedPayload,
      ): Promise<void> {
            const { user1Id, user2Id } = payload;

            if (!user1Id || !user2Id) {
                  this.logger.warn(
                        `[FRIENDSHIP_CONV] Invalid friendship.accepted payload: missing user1Id/user2Id`,
                  );
                  return;
            }

            try {
                  const result =
                        await this.conversationService.getOrCreateDirectConversation(
                              user1Id,
                              user2Id,
                        );

                  if (result.isNew) {
                        this.logger.log(
                              `[FRIENDSHIP_CONV] Created conversation ${result.id} for ${user1Id} ↔ ${user2Id}`,
                        );
                  } else {
                        this.logger.debug(
                              `[FRIENDSHIP_CONV] Conversation ${result.id} already exists for ${user1Id} ↔ ${user2Id}`,
                        );
                  }
            } catch (error) {
                  this.logger.error(
                        `[FRIENDSHIP_CONV] Failed to create conversation for ${user1Id} ↔ ${user2Id}:`,
                        error,
                  );
            }
      }
}
