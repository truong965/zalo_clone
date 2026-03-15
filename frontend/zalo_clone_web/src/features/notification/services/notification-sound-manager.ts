import { STORAGE_KEYS } from '@/constants/storage-keys';
import {
      ensureNotificationSoundDefaults,
      readNotificationSoundSettings,
      type NotificationSoundVolume,
} from './notification-sound-settings';

type PushKind =
      | 'INCOMING_CALL'
      | 'MISSED_CALL'
      | 'NEW_MESSAGE'
      | 'FRIEND_REQUEST'
      | 'FRIEND_ACCEPTED'
      | 'GROUP_EVENT'
      | 'GENERIC';

export interface PushSoundEvent {
      notificationType: PushKind;
      data: Record<string, string>;
      activeConversationId: string | null;
      documentVisibility: DocumentVisibilityState;
      hasFocus: boolean;
}

interface LeaderState {
      tabId: string;
      ts: number;
}

const GLOBAL_COOLDOWN_MS = 8_000;
const DIRECT_MESSAGE_CONVERSATION_COOLDOWN_MS = 15_000;
const GROUP_MESSAGE_CONVERSATION_COOLDOWN_MS = 20_000;
const LEADER_STALE_MS = 15_000;
const LEADER_HEARTBEAT_MS = 5_000;
const INCOMING_CALL_RING_MAX_MS = 30_000;
const DEV = import.meta.env.DEV;

class NotificationSoundManager {
      private readonly tabId = crypto.randomUUID();
      private audioContext: AudioContext | null = null;
      private audioUnlocked = false;
      private ringtoneTickTimer: number | null = null;
      private ringtoneStopTimer: number | null = null;
      private lastPlayedAt = 0;
      private perConversationLastPlayedAt = new Map<string, number>();

      constructor() {
            if (typeof window === 'undefined') return;

            ensureNotificationSoundDefaults();
            this.initAudioUnlockHooks();
            this.startLeaderElection();
      }

      stopIncomingCallRingtone(): void {
            if (this.ringtoneTickTimer !== null) {
                  window.clearInterval(this.ringtoneTickTimer);
                  this.ringtoneTickTimer = null;
            }
            if (this.ringtoneStopTimer !== null) {
                  window.clearTimeout(this.ringtoneStopTimer);
                  this.ringtoneStopTimer = null;
            }
      }

      handlePushEvent(event: PushSoundEvent): void {
            const settings = readNotificationSoundSettings();
            const type = event.notificationType;

            if (!settings.master) {
                  this.logTelemetry('sound_suppressed', { type, reason: 'master_off' });
                  return;
            }
            if (!this.isLeader()) {
                  this.logTelemetry('sound_suppressed', { type, reason: 'not_leader' });
                  return;
            }

            switch (type) {
                  case 'INCOMING_CALL':
                        if (!settings.incomingCall) {
                              this.logTelemetry('sound_suppressed', { type, reason: 'type_disabled' });
                              return;
                        }
                        this.playIncomingCallRingtone(settings.volume);
                        this.logTelemetry('sound_played', { type, sound: 'ringtone' });
                        return;

                  case 'NEW_MESSAGE': {
                        const conversationId = event.data.conversationId ?? null;
                        // Fallback to DIRECT if backend omits conversationType
                        const conversationType = event.data.conversationType || 'DIRECT';

                        // Avoid duplicate noise while user is already reading that conversation.
                        if (conversationId && event.activeConversationId === conversationId) {
                              this.logTelemetry('sound_suppressed', { type, reason: 'active_conversation', conversationId });
                              return;
                        }

                        if (conversationType === 'DIRECT') {
                              if (!settings.messageDirect) {
                                    this.logTelemetry('sound_suppressed', { type, reason: 'type_disabled' });
                                    return;
                              }
                              if (this.hitGlobalCooldown()) {
                                    this.logTelemetry('sound_suppressed', { type, reason: 'global_cooldown' });
                                    return;
                              }
                              if (conversationId && this.hitConversationCooldown(conversationId, DIRECT_MESSAGE_CONVERSATION_COOLDOWN_MS)) {
                                    this.logTelemetry('sound_suppressed', { type, reason: 'conversation_cooldown', conversationId });
                                    return;
                              }

                              this.playMessagePing(settings.volume);
                              this.markSoundPlayed(conversationId ?? undefined);
                              this.logTelemetry('sound_played', { type, sound: 'message_ping', conversationType });
                              return;
                        }

                        // Group messages default OFF (Option A defaults)
                        if (!settings.messageGroup) {
                              this.logTelemetry('sound_suppressed', { type, reason: 'type_disabled' });
                              return;
                        }
                        if (this.hitGlobalCooldown()) {
                              this.logTelemetry('sound_suppressed', { type, reason: 'global_cooldown' });
                              return;
                        }
                        if (conversationId && this.hitConversationCooldown(conversationId, GROUP_MESSAGE_CONVERSATION_COOLDOWN_MS)) {
                              this.logTelemetry('sound_suppressed', { type, reason: 'conversation_cooldown', conversationId });
                              return;
                        }

                        this.playMessagePing(settings.volume, true);
                        this.markSoundPlayed(conversationId ?? undefined);
                        this.logTelemetry('sound_played', { type, sound: 'message_ping_soft', conversationType });
                        return;
                  }

                  case 'FRIEND_REQUEST':
                  case 'FRIEND_ACCEPTED':
                  case 'GROUP_EVENT':
                  case 'MISSED_CALL':
                  case 'GENERIC':
                        // Social/fallback sound default OFF to reduce noise.
                        if (!settings.social) {
                              this.logTelemetry('sound_suppressed', { type, reason: 'type_disabled' });
                              return;
                        }
                        if (this.hitGlobalCooldown()) {
                              this.logTelemetry('sound_suppressed', { type, reason: 'global_cooldown' });
                              return;
                        }
                        this.playMessagePing(settings.volume, true);
                        this.markSoundPlayed();
                        this.logTelemetry('sound_played', { type, sound: 'social_chime' });
                        return;

                  default:
                        return;
            }
      }

      private initAudioUnlockHooks(): void {
            const unlock = async () => {
                  try {
                        const ctx = this.getAudioContext();
                        if (ctx.state === 'suspended') {
                              await ctx.resume();
                        }
                        this.audioUnlocked = true;
                        // Self-remove after successful unlock to avoid needless work
                        window.removeEventListener('click', unlock);
                        window.removeEventListener('keydown', unlock);
                        window.removeEventListener('touchstart', unlock);
                  } catch {
                        // ignore — will retry on next gesture
                  }
            };

            const opts: AddEventListenerOptions = { passive: true };
            window.addEventListener('click', unlock, opts);
            window.addEventListener('keydown', unlock, opts);
            window.addEventListener('touchstart', unlock, opts);
      }

      private getAudioContext(): AudioContext {
            if (!this.audioContext) {
                  this.audioContext = new AudioContext();
            }
            return this.audioContext;
      }

      private getVolumeGain(volume: NotificationSoundVolume): number {
            switch (volume) {
                  case 'low':
                        return 0.15;
                  case 'high':
                        return 0.5;
                  case 'medium':
                  default:
                        return 0.3;
            }
      }

      private playTone(frequency: number, durationMs: number, gainValue: number): void {
            if (!this.audioUnlocked) return;

            try {
                  const ctx = this.getAudioContext();
                  if (ctx.state !== 'running') return;

                  const oscillator = ctx.createOscillator();
                  oscillator.type = 'sine';
                  oscillator.frequency.value = frequency;

                  const gainNode = ctx.createGain();
                  const now = ctx.currentTime;
                  const durationSec = durationMs / 1000;

                  // Natural bell-like envelope: fast attack, exponential decay
                  gainNode.gain.setValueAtTime(0, now);
                  gainNode.gain.linearRampToValueAtTime(gainValue, now + 0.01);
                  gainNode.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
                  gainNode.gain.setValueAtTime(0, now + durationSec);

                  oscillator.connect(gainNode);
                  gainNode.connect(ctx.destination);

                  oscillator.start(now);
                  oscillator.stop(now + durationSec + 0.05); // tiny buffer after decay
            } catch {
                  // ignore
            }
      }

      private playMessagePing(volume: NotificationSoundVolume, soft = false): void {
            const gain = this.getVolumeGain(volume) * (soft ? 0.6 : 1);
            // Pleasant modern chime (E5 -> G#5)
            this.playTone(659.25, 250, gain); // E5
            window.setTimeout(() => this.playTone(830.61, 350, gain * 0.8), 120); // G#5
      }

      private playIncomingCallRingtone(volume: NotificationSoundVolume): void {
            const gain = this.getVolumeGain(volume) * 1.0;

            // restart ringtone loop for latest call signal
            this.stopIncomingCallRingtone();

            const ringOnce = () => {
                  // Standard marimba-like double ring (C5 -> E5)
                  this.playTone(523.25, 300, gain); // C5
                  window.setTimeout(() => this.playTone(659.25, 400, gain), 150); // E5
            };

            ringOnce();
            this.ringtoneTickTimer = window.setInterval(ringOnce, 1400);
            this.ringtoneStopTimer = window.setTimeout(() => {
                  this.stopIncomingCallRingtone();
            }, INCOMING_CALL_RING_MAX_MS);
      }

      private hitGlobalCooldown(): boolean {
            const now = Date.now();
            return now - this.lastPlayedAt < GLOBAL_COOLDOWN_MS;
      }

      private hitConversationCooldown(conversationId: string, cooldownMs: number): boolean {
            const prev = this.perConversationLastPlayedAt.get(conversationId) ?? 0;
            return Date.now() - prev < cooldownMs;
      }

      private markSoundPlayed(conversationId?: string): void {
            const now = Date.now();
            this.lastPlayedAt = now;
            if (conversationId) {
                  this.perConversationLastPlayedAt.set(conversationId, now);
            }

            // Prevent unbounded map growth: prune stale entries periodically
            if (this.perConversationLastPlayedAt.size > 100) {
                  for (const [id, ts] of this.perConversationLastPlayedAt) {
                        if (now - ts > 60_000) this.perConversationLastPlayedAt.delete(id);
                  }
            }
      }

      private startLeaderElection(): void {
            const heartbeat = () => {
                  const current = this.readLeader();
                  const now = Date.now();

                  const shouldTakeOver =
                        !current ||
                        now - current.ts > LEADER_STALE_MS ||
                        current.tabId === this.tabId;

                  if (shouldTakeOver) {
                        this.writeLeader({ tabId: this.tabId, ts: now });
                  }
            };

            heartbeat();
            window.setInterval(heartbeat, LEADER_HEARTBEAT_MS);

            window.addEventListener('beforeunload', () => {
                  const leader = this.readLeader();
                  if (leader?.tabId === this.tabId) {
                        localStorage.removeItem(STORAGE_KEYS.NOTIF_SOUND_LEADER);
                  }
            });
      }

      private isLeader(): boolean {
            const leader = this.readLeader();
            return leader?.tabId === this.tabId;
      }

      private readLeader(): LeaderState | null {
            try {
                  const raw = localStorage.getItem(STORAGE_KEYS.NOTIF_SOUND_LEADER);
                  if (!raw) return null;
                  const parsed = JSON.parse(raw) as LeaderState;
                  if (!parsed.tabId || typeof parsed.ts !== 'number') return null;
                  return parsed;
            } catch {
                  return null;
            }
      }

      private writeLeader(state: LeaderState): void {
            try {
                  localStorage.setItem(STORAGE_KEYS.NOTIF_SOUND_LEADER, JSON.stringify(state));
            } catch {
                  // ignore storage write errors
            }
      }

      // ── DEV-only telemetry ─────────────────────────────────────────────
      // Swap this out for real analytics (Amplitude/GA/custom endpoint)
      // when telemetry infra is available.
      private logTelemetry(event: 'sound_played' | 'sound_suppressed', data: Record<string, unknown>): void {
            if (!DEV) return;
            console.info(`[NotifSound:${event}]`, data);
      }
}

export const notificationSoundManager = new NotificationSoundManager();
