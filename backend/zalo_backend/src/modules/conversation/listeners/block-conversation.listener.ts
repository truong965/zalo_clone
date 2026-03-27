import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { ConversationService } from '../services/conversation.service';
import { InternalEventNames } from '@common/contracts/events/event-names';
import { UserBlockedEvent } from '@modules/block/events/block.events';
import { SocketEvents } from '@common/constants/socket-events.constant';
import { OUTBOUND_SOCKET_EVENT, ISocketEmitEvent } from '@common/events/outbound-socket.event';

@Injectable()
export class BlockConversationListener {
  private readonly logger = new Logger(BlockConversationListener.name);

  constructor(
    private readonly conversationService: ConversationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Listen to internal user.blocked event.
   * When a user blocks someone, notify their other devices to close the conversation.
   */
  @OnEvent(InternalEventNames.USER_BLOCKED, { async: true })
  async handleUserBlocked(event: UserBlockedEvent): Promise<void> {
    const { blockerId, blockedId } = event;

    try {
      // Find the direct conversation between the blocker and the blocked user
      const conversation = await this.conversationService.findDirectConversation(
        blockerId,
        blockedId,
      );

      if (!conversation) {
        this.logger.debug(
          `[BLOCK_CONV] No direct conversation found between ${blockerId} and ${blockedId}`,
        );
        return;
      }

      this.logger.log(
        `[BLOCK_CONV] Syncing block action for blocker ${blockerId} in conversation ${conversation.id}`,
      );

      // Emit new USER_BLOCKED socket event to the blocker's devices
      const socketEvent: ISocketEmitEvent = {
        event: SocketEvents.USER_BLOCKED as any,
        userId: blockerId,
        data: {
          conversationId: conversation.id,
        },
      };

      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, socketEvent);
    } catch (error) {
      this.logger.error(
        `[BLOCK_CONV] Failed to sync block action for ${blockerId}:`,
        (error as Error).stack,
      );
    }
  }
}
