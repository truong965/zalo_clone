import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import { SocketEvents } from 'src/common/constants/socket-events.constant';

@Injectable()
export class MessagingUserPresenceListener extends IdempotentListener {
  @OnEvent(SocketEvents.USER_SOCKET_CONNECTED)
  async handleUserConnected(event: any): Promise<void> {
    await this.withIdempotency(
      `user-connected-${event?.userId || 'unknown'}`,
      async () => {
        const { userId } = event || {};

        try {
          this.logger.debug(`[Messaging] User ${userId} connected`);

          this.logger.debug(
            `[Messaging] Processed connection for user ${userId}`,
          );
        } catch (error) {
          const err = error as Error;
          this.logger.error(
            `[Messaging] Error handling user connection: ${err?.message || String(error)}`,
            err?.stack,
          );
          throw error;
        }
      },
    );
  }

  @OnEvent(SocketEvents.USER_SOCKET_DISCONNECTED)
  async handleUserDisconnected(event: any): Promise<void> {
    await this.withIdempotency(
      `user-disconnected-${event?.userId || 'unknown'}`,
      async () => {
        const { userId } = event || {};

        try {
          this.logger.debug(`[Messaging] User ${userId} disconnected`);

          this.logger.debug(
            `[Messaging] Processed disconnection for user ${userId}`,
          );
        } catch (error) {
          const err = error as Error;
          this.logger.error(
            `[Messaging] Error handling user disconnection: ${err?.message || String(error)}`,
            err?.stack,
          );
          throw error;
        }
      },
    );
  }
}
