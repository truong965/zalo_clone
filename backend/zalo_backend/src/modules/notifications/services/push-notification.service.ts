/**
 * PushNotificationService — high-level push notification orchestrator.
 *
 * Combines DeviceTokenService (token lookup) and FirebaseService (FCM delivery)
 * to provide domain-specific push methods (incoming call, missed call, etc.).
 *
 * Business rules:
 * - Incoming call → HIGH priority, data-only (client renders full-screen UI)
 * - Missed call → NORMAL priority, notification payload (system tray)
 * - Automatically prunes invalid tokens after each send
 */

import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { DeviceTokenService } from './device-token.service';

export interface IncomingCallPushParams {
      callId: string;
      callType: 'VOICE' | 'VIDEO';
      callerId: string;
      callerName: string;
      callerAvatar: string | null;
      calleeId: string;
      conversationId?: string;
}

export interface MissedCallPushParams {
      callId: string;
      callType: 'VOICE' | 'VIDEO';
      callerId: string;
      callerName: string;
      callerAvatar: string | null;
      calleeId: string;
      /** Group call flag — drives group-aware push content */
      isGroupCall?: boolean;
      /** Group conversation name (resolved by listener) */
      conversationName?: string | null;
}

@Injectable()
export class PushNotificationService {
      private readonly logger = new Logger(PushNotificationService.name);

      constructor(
            private readonly firebase: FirebaseService,
            private readonly deviceTokens: DeviceTokenService,
      ) { }

      /** Whether push notifications are available (Firebase initialised + credentials present). */
      get isAvailable(): boolean {
            return this.firebase.isAvailable;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Incoming call (HIGH priority, data-only → client renders call UI)
      // ─────────────────────────────────────────────────────────────────────

      async sendIncomingCallPush(params: IncomingCallPushParams): Promise<void> {
            const {
                  callId,
                  callType,
                  callerId,
                  callerName,
                  callerAvatar,
                  calleeId,
                  conversationId,
            } = params;

            const tokens = await this.deviceTokens.getTokensByUserId(calleeId);
            if (tokens.length === 0) {
                  this.logger.debug(
                        `No FCM tokens for callee ${calleeId.slice(0, 8)}… — skip incoming call push`,
                  );
                  return;
            }

            // Data-only message: client-side rendering for full-screen call UI
            // Do NOT use `notification` key — allows client to handle display
            const data: Record<string, string> = {
                  type: 'INCOMING_CALL',
                  callId,
                  callType,
                  callerId,
                  callerName,
                  callerAvatar: callerAvatar ?? '',
                  conversationId: conversationId ?? '',
                  timestamp: new Date().toISOString(),
            };

            const { invalidTokens } = await this.firebase.sendMulticast(tokens, data, {
                  priority: 'high',
                  ttlSeconds: 30, // Expire quickly — caller may cancel
            });

            await this.deviceTokens.cleanupInvalidTokens(invalidTokens);

            this.logger.log(
                  `📱 Incoming call push sent: ${callId} → callee ${calleeId.slice(0, 8)}… (${tokens.length} device(s))`,
            );
      }

      // ─────────────────────────────────────────────────────────────────────
      // Missed call (NORMAL priority, notification payload)
      // ─────────────────────────────────────────────────────────────────────

      async sendMissedCallPush(params: MissedCallPushParams): Promise<void> {
            const { callId, callType, callerId, callerName, callerAvatar, calleeId, isGroupCall, conversationName } =
                  params;

            const tokens = await this.deviceTokens.getTokensByUserId(calleeId);
            if (tokens.length === 0) return;

            const callTypeLabel = callType === 'VIDEO' ? 'video' : 'thoại';

            // Group-aware notification content
            const notification = isGroupCall
                  ? {
                        title: 'Cuộc gọi nhóm nhỡ',
                        body: conversationName
                              ? `Cuộc gọi nhóm ${callTypeLabel} nhỡ từ ${conversationName}`
                              : `${callerName} đã gọi nhóm ${callTypeLabel}`,
                        imageUrl: callerAvatar ?? undefined,
                  }
                  : {
                        title: 'Cuộc gọi nhỡ',
                        body: `${callerName} đã gọi ${callTypeLabel} cho bạn`,
                        imageUrl: callerAvatar ?? undefined,
                  };

            const data: Record<string, string> = {
                  type: 'MISSED_CALL',
                  callId,
                  callType,
                  callerId,
                  callerName,
                  timestamp: new Date().toISOString(),
            };

            const { invalidTokens } = await this.firebase.sendNotification(
                  tokens,
                  notification,
                  data,
                  { priority: 'normal', ttlSeconds: 3600 },
            );

            await this.deviceTokens.cleanupInvalidTokens(invalidTokens);

            this.logger.log(
                  `📱 Missed call push sent: ${callId} → callee ${calleeId.slice(0, 8)}…`,
            );
      }

      // ─────────────────────────────────────────────────────────────────────
      // Generic push (for future use — chat notifications, etc.)
      // ─────────────────────────────────────────────────────────────────────

      async sendPushToUser(
            userId: string,
            notification: { title: string; body: string; imageUrl?: string },
            data?: Record<string, string>,
      ): Promise<void> {
            const tokens = await this.deviceTokens.getTokensByUserId(userId);
            if (tokens.length === 0) return;

            const { invalidTokens } = await this.firebase.sendNotification(
                  tokens,
                  notification,
                  data,
            );

            await this.deviceTokens.cleanupInvalidTokens(invalidTokens);
      }
}
