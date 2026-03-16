import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SocketGateway } from '../socket.gateway';
import { QR_INTERNAL_EVENTS } from 'src/common/constants/internal-events.constant';

@Injectable()
export class QrLoginSocketListener {
  private readonly logger = new Logger(QrLoginSocketListener.name);

  constructor(private readonly socketGateway: SocketGateway) {}

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
      `Received internal event to emit ${payload.event} to socket ${payload.targetSocketId}`,
    );
    this.socketGateway.emitToSocket(
      payload.targetSocketId,
      payload.event,
      payload.data,
    );
  }

  /**
   * Listen for internal events from TokenService / AuthService to force logout specific devices.
   */
  @OnEvent(QR_INTERNAL_EVENTS.FORCE_LOGOUT_DEVICES)
  async handleForceLogoutDevices(payload: {
    userId: string;
    deviceIds: string[];
    reason: string;
  }) {
    this.logger.debug(
      `Received internal event to force logout ${payload.deviceIds.length} devices for user ${payload.userId}`,
    );
    await this.socketGateway.forceDisconnectDevices(
      payload.userId,
      payload.deviceIds,
      payload.reason,
    );
  }
}
