/**
 * CallEndedSocketListener
 *
 * Bridges `call.ended` domain event → `call:ended` Socket.IO event.
 * Ensures all participants (on any server instance) receive the call-ended notification.
 *
 * DECOUPLED: Now uses EventEmitter to broadcast socket.outbound instead of direct
 * SocketGateway injection, making CallModule independent of SocketModule.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { InternalEventNames } from '@common/contracts/events';
import { SocketEvents } from '@common/constants/socket-events.constant';
import type { CallEndedPayload } from '@modules/call/events';
import {
  OUTBOUND_SOCKET_EVENT,
  ISocketEmitEvent,
} from '@common/events/outbound-socket.event';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class CallEndedSocketListener {
  private readonly logger = new Logger(CallEndedSocketListener.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * When a call ends (from any source), notify all participants via Socket.IO.
   */
  @OnEvent(InternalEventNames.CALL_ENDED, { async: true })
  async handleCallEnded(payload: CallEndedPayload): Promise<void> {
    try {
      const {
        callId,
        initiatorId,
        receiverIds,
        status,
        reason,
        durationSeconds,
      } = payload;

      this.logger.debug(
        `[CALL_ENDED_SOCKET] Emitting call:ended for ${callId} to ${[initiatorId, ...receiverIds].length} users via event emitter`,
      );

      const socketPayload = {
        callId,
        status,
        reason,
        duration: durationSeconds,
      };

      // Construct the standard explicit standard socket message
      const socketEvent: ISocketEmitEvent = {
        event: SocketEvents.CALL_ENDED as any,
        data: socketPayload,
        userIds: [initiatorId, ...receiverIds],
      };

      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, socketEvent);

      // Emit GROUP_CALL_ENDED to clear banner for group calls
      if (payload.conversationId) {
        const conversationMembers = await this.prisma.conversationMember.findMany({
          where: { conversationId: payload.conversationId, status: 'ACTIVE' },
          select: { userId: true },
        });
        const allMemberIds = conversationMembers.map((m) => m.userId);
        this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
          event: SocketEvents.GROUP_CALL_ENDED as any,
          data: {
            callId,
            conversationId: payload.conversationId,
            reason,
            duration: durationSeconds,
          },
          userIds: allMemberIds,
        });
      }
    } catch (error) {
      this.logger.error(
        `[CALL_ENDED_SOCKET] Failed to emit call:ended socket event`,
        error,
      );
    }
  }
}
