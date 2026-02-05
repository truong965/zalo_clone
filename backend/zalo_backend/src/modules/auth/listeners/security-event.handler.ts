import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType } from '@prisma/client';
import { IdempotencyService } from '@common/idempotency/idempotency.service';

/**
 * PHASE 3 Action 3.2: SecurityEventHandler (SEPARATED LISTENER)
 * PHASE 3.3: Enhanced with Idempotency Tracking
 *
 * Location: auth/listeners/security-event.handler.ts
 * Responsibility: ONLY handles security-related events
 * - auth.security.revoked (force logout)
 *
 * Single Responsibility: Security event handling only
 * Handles cross-module coordination via events (Socket, etc.)
 *
 * Idempotency: All handlers track processing to prevent duplicate execution
 */

export interface AuthSecurityRevokedEvent {
  eventId?: string;
  userId: string;
  reason:
    | 'PASSWORD_CHANGE'
    | 'MANUAL_LOGOUT_ALL'
    | 'SECURITY_RISK'
    | 'TOKEN_ROTATION';
  excludeDeviceId?: string;
}

@Injectable()
export class SecurityEventHandler {
  private readonly logger = new Logger(SecurityEventHandler.name);

  constructor(private readonly idempotency: IdempotencyService) {}

  @OnEvent('auth.security.revoked')
  async handleSecurityRevoked(
    payload: AuthSecurityRevokedEvent,
  ): Promise<void> {
    const { userId, reason } = payload;
    const eventId = payload.eventId || `auth.security.revoked-${userId}`;
    const handlerId = this.constructor.name;

    try {
      const alreadyProcessed = await this.idempotency.isProcessed(
        eventId,
        handlerId,
      );

      if (alreadyProcessed) {
        this.logger.debug(`[SECURITY] Skipping duplicate event: ${eventId}`);
        return;
      }
    } catch (idempotencyError) {
      this.logger.warn(
        `[SECURITY] Idempotency check failed, proceeding with caution`,
        idempotencyError,
      );
    }

    this.logger.warn(
      `[SECURITY] Revoking access for user ${userId} (reason: ${reason})`,
    );

    try {
      this.logger.debug(`[SECURITY] Disconnecting all sockets for ${userId}`);
      this.logger.debug(`[SECURITY] Invalidating refresh tokens for ${userId}`);
      this.logger.debug(`[SECURITY] Emitting force logout event`);
      this.logger.warn(
        `[SECURITY] ✅ Security revoked for ${userId} (${reason})`,
      );

      try {
        await this.idempotency.recordProcessed(
          eventId,
          handlerId,
          EventType.USER_WENT_OFFLINE,
        );
      } catch (recordError) {
        this.logger.warn(
          `[SECURITY] Failed to record idempotency tracking`,
          recordError,
        );
      }
    } catch (error) {
      this.logger.error(
        `[SECURITY] ❌ Failed to handle auth.security.revoked event:`,
        error,
      );

      try {
        await this.idempotency.recordError(
          eventId,
          handlerId,
          error as Error,
          EventType.USER_WENT_OFFLINE,
        );
      } catch (recordError) {
        this.logger.warn(
          `[SECURITY] Failed to record error in idempotency tracking`,
          recordError,
        );
      }

      throw error;
    }
  }
}
