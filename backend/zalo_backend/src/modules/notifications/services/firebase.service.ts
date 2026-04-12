/**
 * FirebaseService — Firebase Admin SDK initialization + FCM messaging.
 *
 * Singleton: initialised once during module bootstrap.
 * Responsibility: Low-level FCM message dispatch. Does NOT know about
 * business logic (calls, messages, etc.) — that lives in PushNotificationService.
 *
 * PHASE 5: FCM only. Future phases may add APNs direct push.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App | null = null;

  /** Whether the SDK was initialised successfully */
  get isAvailable(): boolean {
    return this.app !== null;
  }

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const projectId = this.config.get<string>('firebase.projectId');
    const clientEmail = this.config.get<string>('firebase.clientEmail');
    const privateKey = this.config.get<string>('firebase.privateKey');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        '⚠️  Firebase credentials missing — push notifications disabled. ' +
          'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.',
      );
      return;
    }

    try {
      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      this.logger.log('🔥 Firebase Admin SDK initialised');
    } catch (error) {
      this.logger.error('Failed to initialise Firebase Admin SDK', error);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Send a data-only message to multiple device tokens.
   *
   * Returns an array of tokens whose delivery permanently failed
   * (unregistered / invalid) so the caller can prune them.
   */
  async sendMulticast(
    tokens: string[],
    data: Record<string, string>,
    options: { priority?: 'high' | 'normal'; ttlSeconds?: number } = {},
  ): Promise<{ invalidTokens: string[] }> {
    if (!this.app || tokens.length === 0) return { invalidTokens: [] };

    const messaging = this.app.messaging();
    const { priority = 'high', ttlSeconds = 30 } = options;

    const message: admin.messaging.MulticastMessage = {
      tokens,
      data,
      android: {
        priority: priority === 'high' ? 'high' : 'normal',
        ttl: ttlSeconds * 1000,
      },
      webpush: {
        headers: {
          Urgency: priority === 'high' ? 'high' : 'normal',
          TTL: String(ttlSeconds),
        },
      },
      apns: {
        headers: {
          'apns-priority': priority === 'high' ? '10' : '5',
          'apns-expiration': String(Math.floor(Date.now() / 1000) + ttlSeconds),
        },
        payload: {
          aps: {
            contentAvailable: true,
            ...(priority === 'high' ? { sound: 'default' } : {}),
          },
        },
      },
    };

    try {
      const response = await messaging.sendEachForMulticast(message);

      const invalidTokens: string[] = [];
      response.responses.forEach((res, idx) => {
        if (res.error) {
          const code = res.error.code;
          // Permanent failures — token should be removed
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          ) {
            invalidTokens.push(tokens[idx]);
          } else {
            this.logger.warn(
              `FCM transient error for token ${tokens[idx].slice(0, 12)}…: ${code}`,
            );
          }
        }
      });

      this.logger.debug(
        `FCM multicast: ${response.successCount} ok, ${response.failureCount} failed (${invalidTokens.length} invalid)`,
      );

      return { invalidTokens };
    } catch (error) {
      this.logger.error('FCM sendEachForMulticast failed', error);
      return { invalidTokens: [] };
    }
  }

  /**
   * Send a notification message (title + body + optional data) to multiple tokens.
   *
   * @param androidTag - Optional Android notification tag. Two notifications with the same
   * tag replace each other in the tray. Useful for call start/cancel pairing.
   */
  async sendNotification(
    tokens: string[],
    notification: { title: string; body: string; imageUrl?: string },
    data?: Record<string, string>,
    options: {
      priority?: 'high' | 'normal';
      ttlSeconds?: number;
      androidTag?: string;
    } = {},
  ): Promise<{ invalidTokens: string[] }> {
    if (!this.app || tokens.length === 0) return { invalidTokens: [] };

    const messaging = this.app.messaging();
    const { priority = 'normal', ttlSeconds = 3600, androidTag } = options;

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: notification.title,
        body: notification.body,
        ...(notification.imageUrl ? { imageUrl: notification.imageUrl } : {}),
      },
      ...(data ? { data } : {}),
      android: {
        priority: priority === 'high' ? 'high' : 'normal',
        ttl: ttlSeconds * 1000,
        // Tag lets the OS replace the existing notification with the same tag.
        // Used by cancelCallNotification to dismiss the incoming-call tray entry.
        ...(androidTag
          ? { notification: { tag: androidTag, sound: 'default' } }
          : {}),
      },
      webpush: {
        headers: {
          Urgency: priority === 'high' ? 'high' : 'normal',
          TTL: String(ttlSeconds),
        },
      },
      apns: {
        headers: {
          'apns-priority': priority === 'high' ? '10' : '5',
          'apns-expiration': String(
            Math.floor(Date.now() / 1000) + ttlSeconds,
          ),
        },
        payload: {
          aps: {
            contentAvailable: true,
            ...(priority === 'high' ? { sound: 'default' } : {}),
          },
        },
      },
    };

    try {
      const response = await messaging.sendEachForMulticast(message);

      const invalidTokens: string[] = [];
      response.responses.forEach((res, idx) => {
        if (res.error) {
          const code = res.error.code;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument'
          ) {
            invalidTokens.push(tokens[idx]);
          } else {
            this.logger.warn(
              `FCM transient error for token ${tokens[idx].slice(0, 12)}…: ${code}`,
            );
          }
        }
      });

      return { invalidTokens };
    } catch (error) {
      this.logger.error('FCM sendNotification failed', error);
      return { invalidTokens: [] };
    }
  }
}
