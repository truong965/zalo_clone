import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { QR_INTERNAL_EVENTS } from 'src/common/constants/internal-events.constant';
import {
  OUTBOUND_SOCKET_EVENT,
  ISocketEmitEvent,
} from '@common/events/outbound-socket.event';
import { InternalEventNames } from '@common/contracts/events';

@Injectable()
export class QrLoginSocketListener {
  private readonly logger = new Logger(QrLoginSocketListener.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Listen for internal events from QrLoginService to emit to a specific socket.
   */
  @OnEvent(QR_INTERNAL_EVENTS.EMIT_TO_SOCKET)
  handleEmitToSocket(payload: {
    targetSocketId: string;
    event: string;
    data: unknown;
  }) {
    this.logger.debug(
      `Received internal event to emit ${payload.event} to socket ${payload.targetSocketId} via new interface`,
    );

    const socketEvent: ISocketEmitEvent = {
      event: payload.event as any,
      socketId: payload.targetSocketId,
      data: payload.data,
    };
    this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, socketEvent);
  }

  /**
   * Listen for internal events from TokenService / AuthService to force logout specific devices.
   */
  @OnEvent(QR_INTERNAL_EVENTS.FORCE_LOGOUT_DEVICES)
  async handleForceLogoutDevices(payload: {
    userId: string;
    deviceIds: string[];
    reason: string;
    excludeDeviceId?: string;
  }) {
    this.logger.debug(
      `Received internal event to force logout ${payload.deviceIds.length} devices for user ${payload.userId}`,
    );

    // This is a special case: Since Socket isn't a domain, but Force Disconnect is a Core Socket command
    // We emit a special internal socket outbound to trigger the force disconnect internally in gateway
    this.eventEmitter.emit(
      InternalEventNames.SOCKET_INTERNAL_FORCE_DISCONNECT_DEVICES,
      payload,
    );
  }
}
