/**
 * useReminderNotifications — Global singleton hook for reminder notifications.
 *
 * Call ONCE at app level (ChatFeature) to:
 * 1. Listen for `REMINDER_TRIGGERED` socket events → show modal + browser notification
 * 2. On reconnect → fetch undelivered reminders and show them
 * 3. Acknowledge (complete) reminders when user dismisses
 *
 * Eliminates duplicate listeners (Bug 3) and handles offline delivery (Bug 4).
 */

import { useEffect, useCallback, useRef } from 'react';
import { Modal } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { reminderApi } from '../api/reminder.api';
import { REMINDERS_BASE_KEY } from './use-reminders';
import { useSocket } from '@/hooks/use-socket';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { SocketEvents } from '@/constants/socket-events';
import { conversationKeys } from '@/features/conversation/hooks/use-conversation-queries';
import type { ReminderTriggeredPayload } from '@/types/api';
import type { ConversationUI } from '@/types/api';

/**
 * Module-level AudioContext — created once after first user gesture.
 * Browsers require a user gesture before AudioContext can be started.
 * We cache the instance and resume it on demand.
 */
let _audioCtx: AudioContext | null = null;

/** Called on first user click/keydown to unlock audio for this session */
function unlockAudioContext(): void {
      try {
            if (!_audioCtx) {
                  _audioCtx = new AudioContext();
            } else if (_audioCtx.state === 'suspended') {
                  void _audioCtx.resume();
            }
      } catch {
            // Not critical
      }
}

/** Simple notification sound using Web Audio API */
async function playNotificationSound(): Promise<void> {
      try {
            if (!_audioCtx) return; // Haven't had a user gesture yet — skip silently

            // Resume if browser suspended the context (tab was backgrounded)
            if (_audioCtx.state === 'suspended') {
                  await _audioCtx.resume();
            }

            const oscillator = _audioCtx.createOscillator();
            const gain = _audioCtx.createGain();
            oscillator.connect(gain);
            gain.connect(_audioCtx.destination);

            oscillator.frequency.setValueAtTime(800, _audioCtx.currentTime);
            oscillator.frequency.setValueAtTime(600, _audioCtx.currentTime + 0.1);
            oscillator.frequency.setValueAtTime(800, _audioCtx.currentTime + 0.2);

            gain.gain.setValueAtTime(0.3, _audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, _audioCtx.currentTime + 0.4);

            oscillator.start(_audioCtx.currentTime);
            oscillator.stop(_audioCtx.currentTime + 0.4);
      } catch {
            // Silent fail — audio not critical
      }
}

/** Request browser notification permission (once) */
function requestNotificationPermission() {
      if ('Notification' in window && Notification.permission === 'default') {
            void Notification.requestPermission();
      }
}

/** Show browser notification when tab is unfocused */
function showBrowserNotification(content: string, conversationId: string | null) {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (document.hasFocus()) return; // Only for unfocused tab

      const n = new Notification('⏰ Nhắc hẹn', {
            body: content,
            icon: '/vite.svg',
            tag: 'reminder', // Prevent stacking
            requireInteraction: true,
      });

      n.onclick = () => {
            window.focus();
            if (conversationId) {
                  // Navigate to conversation — simple approach via URL
                  window.dispatchEvent(
                        new CustomEvent('reminder:navigate', { detail: { conversationId } }),
                  );
            }
            n.close();
      };
}

/** Show persistent modal notification + acknowledge on dismiss */
function showReminderModal(
      payload: { reminderId: string; content: string; conversationId: string | null },
      onAcknowledge?: (reminderId: string) => void,
) {
      Modal.confirm({
            title: '⏰ Nhắc hẹn',
            icon: <ClockCircleOutlined style={{ color: '#1890ff' }} />,
            content: (
                  <div className="py-2" >
                        <p className="text-sm text-gray-700 whitespace-pre-wrap" > {payload.content} </p>
                  </div>
            ),
            okText: 'Đã xem',
            cancelText: 'Để sau',
            centered: true,
            onOk: () => {
                  onAcknowledge?.(payload.reminderId);
            },
            // Don't auto-acknowledge on cancel — reminder stays as TRIGGERED
      });
}

export function useReminderNotifications() {
      const { socket, isConnected, connectionNonce } = useSocket();
      const queryClient = useQueryClient();
      const currentUserId = useAuthStore((s) => s.user?.id ?? null);
      const isFirstMount = useRef(true);

      // Acknowledge = mark as completed (only the creator can do this)
      const acknowledgeReminder = useCallback(
            (reminderId: string) => {
                  void reminderApi
                        .updateReminder(reminderId, { isCompleted: true })
                        .then(() => {
                              void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
                        });
            },
            [queryClient],
      );

      // Request browser notification permission on mount
      useEffect(() => {
            requestNotificationPermission();
      }, []);

      // Unlock AudioContext on first user gesture (browser autoplay policy)
      useEffect(() => {
            document.addEventListener('click', unlockAudioContext, { once: true });
            document.addEventListener('keydown', unlockAudioContext, { once: true });
            return () => {
                  document.removeEventListener('click', unlockAudioContext);
                  document.removeEventListener('keydown', unlockAudioContext);
            };
      }, []);

      // Listen for REMINDER_TRIGGERED socket events
      useEffect(() => {
            if (!socket) return;

            const handleTriggered = (payload: ReminderTriggeredPayload) => {
                  // Defence-in-depth: skip notification if the conversation is muted
                  // (backend already filters, but guard against race conditions)
                  if (payload.conversationId) {
                        const cached = queryClient.getQueryData<ConversationUI>(
                              conversationKeys.detail(payload.conversationId),
                        );
                        if (cached?.isMuted) return;
                  }

                  // Play sound (async — fire-and-forget, errors caught inside)
                  void playNotificationSound();

                  // Creator sees persistent modal with "complete" action;
                  // other members see it as view-only (modal closes without API call)
                  const isCreator = currentUserId === payload.creatorId;
                  showReminderModal(payload, isCreator ? acknowledgeReminder : undefined);

                  // Show browser notification if tab unfocused
                  showBrowserNotification(payload.content, payload.conversationId);

                  // Invalidate cache to refresh lists
                  void queryClient.invalidateQueries({ queryKey: REMINDERS_BASE_KEY });
            };

            socket.on(SocketEvents.REMINDER_TRIGGERED, handleTriggered);
            return () => {
                  socket.off(SocketEvents.REMINDER_TRIGGERED, handleTriggered);
            };
      }, [socket, queryClient, acknowledgeReminder, currentUserId]);

      // On reconnect → fetch missed (undelivered) reminders
      // Note: getUndelivered only returns the current user’s own reminders
      // (non-creators of group reminders don’t receive re-notifications here — intentional)
      useEffect(() => {
            if (!isConnected) return;

            // Skip on first mount to avoid showing stale reminders from before
            if (isFirstMount.current) {
                  isFirstMount.current = false;
                  // But still fetch undelivered on first mount (user might have been offline)
            }

            const fetchMissed = async () => {
                  try {
                        const missed = await reminderApi.getUndelivered();
                        for (const reminder of missed) {
                              showReminderModal(
                                    {
                                          reminderId: reminder.id,
                                          content: reminder.content,
                                          conversationId: reminder.conversationId,
                                    },
                                    acknowledgeReminder,
                              );
                        }
                        if (missed.length > 0) {
                              void playNotificationSound();
                        }
                  } catch {
                        // Silent fail — will retry on next reconnect
                  }
            };

            void fetchMissed();
      }, [isConnected, connectionNonce, acknowledgeReminder]);
}
