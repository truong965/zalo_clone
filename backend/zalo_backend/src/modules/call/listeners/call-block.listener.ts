import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CallHistoryService } from '../call-history.service';

/**
 * PHASE 3.5: Call Block Integration via Events
 *
 * React to block/unblock events and manage active calls.
 * This breaks coupling: CallModule ← BlockModule
 *
 * Event Subscriptions:
 * - user.blocked: Terminate all active calls between blocked users
 *
 * NOTE: Idempotency is not strictly needed here since:
 * - Redis operations are idempotent (removing non-existent keys is safe)
 * - Call termination events can be replayed without side effects
 */
@Injectable()
export class CallBlockListener {
  private readonly logger = new Logger(CallBlockListener.name);

  constructor(private readonly callHistoryService: CallHistoryService) {}

  /**
   * Handle UserBlockedEvent
   * Terminate all active calls between the two users
   *
   * Action: Find active calls where one user is caller and other is callee
   *         Remove them from Redis and emit call.terminated event
   *         Socket module will handle client notifications
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
          `[CallBlock] Invalid event data: ${JSON.stringify(event)}`,
        );
        return;
      }

      this.logger.log(
        `[CallBlock] Processing: ${blockerId} blocked ${blockedId}`,
      );

      // Terminate active calls
      const terminatedCount =
        await this.callHistoryService.terminateCallsBetweenUsers(
          blockerId,
          blockedId,
        );

      this.logger.log(
        `[CallBlock] ✅ Terminated ${terminatedCount} call(s) between ${blockerId} and ${blockedId}`,
      );
    } catch (error) {
      this.logger.error(
        `[CallBlock] ❌ Failed to handle user.blocked event:`,
        error,
      );
      // Don't throw - we want event listener to continue even if this fails
    }
  }

  /**
   * Handle UserUnblockedEvent
   * No action needed - calls are not restored after unblock
   * (User must manually initiate new calls)
   */
  @OnEvent('user.unblocked')
  handleUserUnblocked(event: { blockerId?: string; blockedId?: string }): void {
    const blockerId = event?.blockerId;
    const blockedId = event?.blockedId;

    this.logger.debug(
      `[CallBlock] User ${blockerId} unblocked ${blockedId} - no call action needed`,
    );
  }
}
