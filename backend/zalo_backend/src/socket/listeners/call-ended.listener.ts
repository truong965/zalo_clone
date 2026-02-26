/**
 * CallEndedSocketListener
 *
 * Bridges `call.ended` domain event → `call:ended` Socket.IO event.
 * Ensures all participants (on any server instance) receive the call-ended notification.
 *
 * Lives in SocketModule because it needs access to SocketGateway for emitting.
 *
 * Note: The CallSignalingGateway already emits call:ended to the Socket.IO room
 * for server-initiated endings. This listener covers domain events emitted by
 * other sources (e.g. CallBlockListener, admin actions, cleanup jobs).
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SocketGateway } from '../socket.gateway';
import { SocketEvents } from '@common/constants/socket-events.constant';
import type { CallEndedPayload } from '@modules/call/listeners/call-event.handler';

@Injectable()
export class CallEndedSocketListener {
      private readonly logger = new Logger(CallEndedSocketListener.name);

      constructor(private readonly socketGateway: SocketGateway) { }

      /**
       * When a call ends (from any source), notify all participants via Socket.IO.
       *
       * Deduplication: The CallSignalingGateway already emits to the call room
       * for interactive scenarios. This listener ensures coverage when the domain
       * event is emitted by background processes (block, cleanup) that don't
       * have access to the call room. The frontend should handle duplicate
       * call:ended events idempotently (based on callId).
       */
      @OnEvent('call.ended')
      async handleCallEnded(payload: CallEndedPayload): Promise<void> {
            const { callId, initiatorId, receiverIds, status, reason, durationSeconds } = payload;

            this.logger.debug(
                  `[CALL_ENDED_SOCKET] Emitting call:ended for ${callId} to ${[initiatorId, ...receiverIds].length} users`,
            );

            const socketPayload = {
                  callId,
                  status,
                  reason,
                  duration: durationSeconds,
            };

            // Emit to initiator
            await this.socketGateway
                  .emitToUser(initiatorId, SocketEvents.CALL_ENDED as string, socketPayload)
                  .catch(() => undefined);

            // Emit to all receivers
            await Promise.all(
                  receiverIds.map((receiverId) =>
                        this.socketGateway
                              .emitToUser(receiverId, SocketEvents.CALL_ENDED as string, socketPayload)
                              .catch(() => undefined),
                  ),
            );
      }
}
