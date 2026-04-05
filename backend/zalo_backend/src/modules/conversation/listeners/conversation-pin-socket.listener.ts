import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { SocketEvents } from '@common/constants/socket-events.constant';
import {
  ISocketEmitEvent,
  OUTBOUND_SOCKET_EVENT,
} from '@common/events/outbound-socket.event';
import { InternalEventNames } from '@common/contracts/events/event-names';
import type { ConversationPinnedEvent, ConversationUnpinnedEvent } from '../events';

@Injectable()
export class ConversationPinSocketListener {
  private readonly logger = new Logger(ConversationPinSocketListener.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  @OnEvent(InternalEventNames.CONVERSATION_PINNED)
  async handleConversationPinned(payload: ConversationPinnedEvent): Promise<void> {
    try {
      const socketEvent: ISocketEmitEvent = {
        event: SocketEvents.CONVERSATION_PINNED,
        userId: payload.userId,
        data: {
          conversationId: payload.conversationId,
          pinnedAt: payload.pinnedAt,
        },
      };

      await this.eventEmitter.emitAsync(OUTBOUND_SOCKET_EVENT, socketEvent);
      this.logger.debug(`[CONVERSATION_PINNED] Emitted to user ${payload.userId}`);
    } catch (error) {
      this.logger.error(
        `[CONVERSATION_PINNED] Failed to emit socket for user ${payload.userId}`,
        (error as Error).stack,
      );
    }
  }

  @OnEvent(InternalEventNames.CONVERSATION_UNPINNED)
  async handleConversationUnpinned(
    payload: ConversationUnpinnedEvent,
  ): Promise<void> {
    try {
      const socketEvent: ISocketEmitEvent = {
        event: SocketEvents.CONVERSATION_UNPINNED,
        userId: payload.userId,
        data: {
          conversationId: payload.conversationId,
        },
      };

      await this.eventEmitter.emitAsync(OUTBOUND_SOCKET_EVENT, socketEvent);
      this.logger.debug(`[CONVERSATION_UNPINNED] Emitted to user ${payload.userId}`);
    } catch (error) {
      this.logger.error(
        `[CONVERSATION_UNPINNED] Failed to emit socket for user ${payload.userId}`,
        (error as Error).stack,
      );
    }
  }
}
