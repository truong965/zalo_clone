/**
 * PrivacyUserRegisteredListener
 *
 * Listens to `user.registered` and creates a PrivacySettings row
 * with default values for the newly registered user.
 *
 * Without this, any downstream privacy check (e.g. "who can message me")
 * will fail with a missing-record error.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { InternalEventNames } from '@common/contracts/events/event-names';

interface UserRegisteredPayload {
  userId?: string;
  [key: string]: unknown;
}

@Injectable()
export class PrivacyUserRegisteredListener {
  private readonly logger = new Logger(PrivacyUserRegisteredListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(InternalEventNames.USER_REGISTERED, { async: true })
  async handleUserRegistered(payload: UserRegisteredPayload): Promise<void> {
    const userId = payload?.userId;

    if (!userId) {
      this.logger.warn(
        `[PRIVACY_REG] Invalid user.registered payload: missing userId`,
      );
      return;
    }

    try {
      await this.prisma.privacySettings.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });

      this.logger.log(
        `[PRIVACY_REG] PrivacySettings created for user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `[PRIVACY_REG] Failed to create PrivacySettings for user ${userId}:`,
        error,
      );
    }
  }
}
