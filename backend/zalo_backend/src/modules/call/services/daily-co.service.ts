/**
 * DailyCoService — Server-side Daily.co REST API integration.
 *
 * Responsibilities:
 * - Create rooms for group calls and P2P→SFU fallback
 * - Generate meeting tokens for participants (server-side only, API key never sent to client)
 * - Delete rooms on call end (cleanup)
 *
 * Daily.co REST API docs: https://docs.daily.co/reference/rest-api
 *
 * IMPORTANT: DAILY_API_KEY is server-side only — never expose to frontend.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import * as NestConfig from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import callConfig from 'src/config/call.config';

// ============================================================================
// TYPES
// ============================================================================

export interface DailyRoom {
      /** Room ID from Daily.co */
      id: string;
      /** Room name (used in URL) */
      name: string;
      /** Full room URL: https://{domain}.daily.co/{name} */
      url: string;
      /** Room creation timestamp */
      created_at: string;
}

export interface DailyMeetingToken {
      /** The JWT token string */
      token: string;
}

export interface DailyRoomConfig {
      /** Max participants allowed (default: 10) */
      maxParticipants?: number;
      /** Auto-delete room after this many seconds of being empty (default: 3600 = 1h) */
      expireSeconds?: number;
      /** Enable recording (default: false) */
      enableRecording?: boolean;
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class DailyCoService implements OnModuleInit {
      private readonly logger = new Logger(DailyCoService.name);
      private client: AxiosInstance;
      private domain: string;
      private isConfigured = false;

      constructor(
            @Inject(callConfig.KEY)
            private readonly config: NestConfig.ConfigType<typeof callConfig>,
      ) {
            this.domain = this.config.dailyDomain;
            this.client = axios.create({
                  baseURL: 'https://api.daily.co/v1',
                  headers: {
                        Authorization: `Bearer ${this.config.dailyApiKey}`,
                        'Content-Type': 'application/json',
                  },
                  timeout: 10_000,
            });
      }

      onModuleInit() {
            if (this.config.dailyApiKey && this.config.dailyDomain) {
                  this.isConfigured = true;
                  this.logger.log(
                        `✅ Daily.co configured (domain: ${this.config.dailyDomain})`,
                  );
            } else {
                  this.logger.warn(
                        '⚠️ Daily.co not configured — DAILY_API_KEY or DAILY_DOMAIN missing. ' +
                        'Group calls and P2P fallback will not work.',
                  );
            }
      }

      /** Check if Daily.co is properly configured */
      get available(): boolean {
            return this.isConfigured;
      }

      // ─────────────────────────────────────────────────────────────────────────
      // ROOM MANAGEMENT
      // ─────────────────────────────────────────────────────────────────────────

      /**
       * Create a Daily.co room for a call.
       *
       * @param callId - Used as room name prefix for traceability
       * @param config - Room configuration
       * @returns Created room info including URL
       */
      async createRoom(
            callId: string,
            config: DailyRoomConfig = {},
      ): Promise<DailyRoom> {
            if (!this.isConfigured) {
                  throw new Error('Daily.co is not configured');
            }

            const {
                  maxParticipants = 10,
                  expireSeconds = 3600, // 1 hour
                  enableRecording = false,
            } = config;

            // Room name: short prefix + callId (Daily requires alphanumeric + hyphens)
            const roomName = `call-${callId}`;

            // Auto-delete: room expires N seconds after creation
            const exp = Math.floor(Date.now() / 1000) + expireSeconds;

            try {
                  const response = await this.client.post<DailyRoom>('/rooms', {
                        name: roomName,
                        properties: {
                              max_participants: maxParticipants,
                              exp,
                              enable_recording: enableRecording ? 'cloud' : false,
                              enable_chat: false,
                              enable_knocking: false,
                              start_video_off: false,
                              start_audio_off: false,
                              // SFU mode: Daily automatically selects SFU when >2 participants
                              // or when network conditions benefit from it
                        },
                  });

                  this.logger.log(
                        `Daily.co room created: ${response.data.name} (max: ${maxParticipants}, exp: ${expireSeconds}s)`,
                  );

                  return response.data;
            } catch (error: any) {
                  const message = error.response?.data?.info ?? error.message;
                  this.logger.error(`Failed to create Daily.co room: ${message}`);
                  throw new Error(`Daily.co room creation failed: ${message}`);
            }
      }

      /**
       * Create a meeting token for a specific user.
       *
       * Tokens are scoped to a specific room and user. The token encodes
       * the user's identity and permissions.
       *
       * @param roomName - The room name (not URL)
       * @param userId - User ID (stored as user_name in Daily)
       * @param displayName - Display name shown in Daily UI
       * @param isOwner - Whether this user is the room owner (can kick, mute others)
       * @returns Meeting token JWT
       */
      async createMeetingToken(
            roomName: string,
            userId: string,
            displayName: string,
            isOwner: boolean = false,
      ): Promise<string> {
            if (!this.isConfigured) {
                  throw new Error('Daily.co is not configured');
            }

            // Token expires in 1 hour
            const exp = Math.floor(Date.now() / 1000) + 3600;

            try {
                  const response = await this.client.post<DailyMeetingToken>(
                        '/meeting-tokens',
                        {
                              properties: {
                                    room_name: roomName,
                                    user_name: displayName,
                                    user_id: userId,
                                    is_owner: isOwner,
                                    exp,
                                    enable_screenshare: false,
                                    start_video_off: false,
                                    start_audio_off: false,
                              },
                        },
                  );

                  return response.data.token;
            } catch (error: any) {
                  const message = error.response?.data?.info ?? error.message;
                  this.logger.error(
                        `Failed to create meeting token for ${userId}: ${message}`,
                  );
                  throw new Error(`Daily.co token creation failed: ${message}`);
            }
      }

      /**
       * Delete a Daily.co room.
       *
       * Called when a call ends to clean up server-side resources.
       * Fails silently (room may have already auto-expired).
       *
       * @param roomName - The room name to delete
       */
      async deleteRoom(roomName: string): Promise<void> {
            if (!this.isConfigured) return;

            try {
                  await this.client.delete(`/rooms/${roomName}`);
                  this.logger.log(`Daily.co room deleted: ${roomName}`);
            } catch (error: any) {
                  // 404 = already deleted (auto-expired) — safe to ignore
                  if (error.response?.status === 404) {
                        this.logger.debug(`Daily.co room already deleted: ${roomName}`);
                        return;
                  }
                  const message = error.response?.data?.info ?? error.message;
                  this.logger.warn(
                        `Failed to delete Daily.co room ${roomName}: ${message}`,
                  );
            }
      }

      /**
       * Build the full room URL for the frontend to join.
       */
      getRoomUrl(roomName: string): string {
            return `https://${this.domain}.daily.co/${roomName}`;
      }
}
