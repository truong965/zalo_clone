/**
 * DeviceTokenService — CRUD for user push-notification device tokens.
 *
 * Backed by Prisma `UserDevice` model.
 * Called by DeviceTokenController (REST) and internally by PushNotificationService.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';

@Injectable()
export class DeviceTokenService {
      private readonly logger = new Logger(DeviceTokenService.name);

      constructor(private readonly prisma: PrismaService) { }

      /**
       * Register (upsert) a device token for a user.
       * If the same (userId, deviceId) already exists, update the token + lastActiveAt.
       */
      async registerToken(params: {
            userId: string;
            deviceId: string;
            fcmToken: string;
            platform?: string;
      }): Promise<void> {
            const { userId, deviceId, fcmToken, platform } = params;

            await this.prisma.userDevice.upsert({
                  where: { userId_deviceId: { userId, deviceId } },
                  update: {
                        fcmToken,
                        platform: platform ?? undefined,
                        lastActiveAt: new Date(),
                  },
                  create: {
                        userId,
                        deviceId,
                        fcmToken,
                        platform: platform ?? null,
                  },
            });

            this.logger.debug(
                  `Device token registered: user=${userId.slice(0, 8)}… device=${deviceId.slice(0, 12)}…`,
            );
      }

      /**
       * Remove a specific device for a user (e.g. on logout).
       */
      async removeToken(userId: string, deviceId: string): Promise<void> {
            await this.prisma.userDevice
                  .delete({
                        where: { userId_deviceId: { userId, deviceId } },
                  })
                  .catch(() => {
                        // Ignore if already removed
                  });
      }

      /**
       * Get all FCM tokens for a user (may have multiple devices).
       * Only returns tokens that are not null.
       */
      async getTokensByUserId(userId: string): Promise<string[]> {
            const devices = await this.prisma.userDevice.findMany({
                  where: { userId },
                  select: { fcmToken: true },
            });

            return devices
                  .map((d) => d.fcmToken)
                  .filter((token): token is string => !!token);
      }

      /**
       * Remove invalid/expired tokens after a failed FCM delivery.
       */
      async cleanupInvalidTokens(invalidTokens: string[]): Promise<void> {
            if (invalidTokens.length === 0) return;

            const result = await this.prisma.userDevice.deleteMany({
                  where: { fcmToken: { in: invalidTokens } },
            });

            if (result.count > 0) {
                  this.logger.log(`Cleaned ${result.count} invalid FCM token(s)`);
            }
      }

      /**
       * Update lastActiveAt to keep device record fresh.
       */
      async touchDevice(userId: string, deviceId: string): Promise<void> {
            await this.prisma.userDevice
                  .update({
                        where: { userId_deviceId: { userId, deviceId } },
                        data: { lastActiveAt: new Date() },
                  })
                  .catch(() => {
                        // Ignore if device doesn't exist
                  });
      }
}
