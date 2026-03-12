import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType, TokenRevocationReason } from '@prisma/client';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { TokenService } from '../services/token.service';

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
 *
 * SocketGateway is resolved lazily via ModuleRef to avoid circular dependency
 * (AuthModule ← SocketModule → AuthModule).
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
export class SecurityEventHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(SecurityEventHandler.name);
  private socketGateway: { forceDisconnectUser(userId: string, reason: string): Promise<void> };

  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly tokenService: TokenService,
    private readonly moduleRef: ModuleRef,
  ) { }

  onApplicationBootstrap() {
    try {
      // Lazy resolve SocketGateway to avoid circular module dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SocketGateway } = require('../../../socket/socket.gateway') as {
        SocketGateway: new (...args: unknown[]) => typeof this.socketGateway;
      };
      this.socketGateway = this.moduleRef.get(SocketGateway, { strict: false });
      this.logger.log('SecurityEventHandler: SocketGateway resolved ✅');
    } catch (err) {
      this.logger.warn(
        'SecurityEventHandler: SocketGateway not available — socket disconnect will be skipped',
        (err as Error).message,
      );
    }
  }

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
      // 1. Revoke all refresh tokens in DB
      await this.tokenService.revokeAllUserSessions(
        userId,
        TokenRevocationReason.SUSPICIOUS_ACTIVITY,
      );
      this.logger.debug(`[SECURITY] Invalidated all refresh tokens for ${userId}`);

      // 2. Force disconnect all active WebSocket connections
      if (this.socketGateway) {
        await this.socketGateway.forceDisconnectUser(
          userId,
          `Security revocation: ${reason}`,
        );
        this.logger.debug(`[SECURITY] Disconnected all sockets for ${userId}`);
      }

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
