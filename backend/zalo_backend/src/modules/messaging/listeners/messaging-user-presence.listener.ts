import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';

/**
 * PHASE 2: Socket/Messaging Integration via Events
 *
 * React to user presence changes (connect/disconnect) in messaging system.
 * This breaks coupling: SocketGateway → MessagingGateway
 *
 * BEFORE: SocketGateway @Inject(forwardRef(() => MessagingGateway))
 * AFTER: SocketGateway emits events → MessagingUserPresenceListener reacts
 *
 * Event Subscriptions:
 * - user.socket.connected: User connected to WebSocket
 * - user.socket.disconnected: User disconnected from WebSocket
 *
 * Business Logic (Deferred to PHASE 3):
 * - Sync offline messages on connection
 * - Cleanup subscriptions on disconnect
 * - Update user presence in cache
 */
@Injectable()
export class MessagingUserPresenceListener extends IdempotentListener {
  /**
   * Handle user connected to WebSocket
   * Sync offline messages and update presence
   */
  @OnEvent('user.socket.connected')
  async handleUserConnected(event: any): Promise<void> {
    await this.withIdempotency(
      `user-connected-${event?.userId || 'unknown'}`,
      async () => {
        const { userId } = event || {};

        try {
          this.logger.debug(`[Messaging] User ${userId} connected`);

          // TODO PHASE 3: Implement presence logic
          // - Sync offline messages from queue to client
          // - Subscribe to receipt updates via Redis
          // - Mark user as online in cache
          // - Reactivate archived conversations if needed

          this.logger.debug(
            `[Messaging] Processed connection for user ${userId}`,
          );
        } catch (error) {
          const err = error;
          this.logger.error(
            `[Messaging] Error handling user connection: ${err?.message || String(error)}`,
            err?.stack,
          );
          throw error;
        }
      },
    );
  }

  /**
   * Handle user disconnected from WebSocket
   * Cleanup subscriptions and mark offline
   */
  @OnEvent('user.socket.disconnected')
  async handleUserDisconnected(event: any): Promise<void> {
    await this.withIdempotency(
      `user-disconnected-${event?.userId || 'unknown'}`,
      async () => {
        const { userId } = event || {};

        try {
          this.logger.debug(`[Messaging] User ${userId} disconnected`);

          // TODO PHASE 3: Implement presence logic
          // - Cleanup Redis subscriptions
          // - Mark user as offline in cache
          // - Queue unsent notifications
          // - Handle group conversation subscriptions

          this.logger.debug(
            `[Messaging] Processed disconnection for user ${userId}`,
          );
        } catch (error) {
          const err = error;
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
