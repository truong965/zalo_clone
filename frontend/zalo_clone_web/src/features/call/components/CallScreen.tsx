/**
 * CallScreen — Compound component for the full-screen call view.
 *
 * Renders VoiceCallView, VideoCallView, or DailyCallView based on
 * callType and provider.
 * Includes CallControls, QualityIndicator, ReconnectingOverlay.
 *
 * Used both as a route and as a portal from ActiveCallFloating.
 *
 * Composition: explicit variant components instead of boolean props.
 */

import { useEffect, useCallback } from 'react';
import { useCallStore } from '../stores/call.store';
import { VideoCallView } from './VideoCallView';
import { VoiceCallView } from './VoiceCallView';
import { DailyCallView } from './DailyCallView';
import { CallControls } from './CallControls';
import { ReconnectingOverlay } from './ReconnectingOverlay';

export function CallScreen() {
      const callStatus = useCallStore((s) => s.callStatus);
      const callType = useCallStore((s) => s.callType);
      const provider = useCallStore((s) => s.provider);

      // ── Hangup handler (dispatches to CallManager) ──────────────────────
      const handleHangup = useCallback(() => {
            window.dispatchEvent(new CustomEvent('call:hangup'));
      }, []);

      // ── Keep screen awake during call (Screen Wake Lock API) ───────────
      useEffect(() => {
            let wakeLock: WakeLockSentinel | null = null;

            const acquire = async () => {
                  try {
                        if ('wakeLock' in navigator && callStatus === 'ACTIVE') {
                              wakeLock = await navigator.wakeLock.request('screen');
                        }
                  } catch {
                        // Wake lock not supported or page not visible — safe to ignore
                  }
            };

            void acquire();

            return () => {
                  void wakeLock?.release();
            };
      }, [callStatus]);

      // If no active call, render nothing (fallback)
      if (callStatus === 'IDLE' || callStatus === 'ENDED') {
            return (
                  <div className="flex h-full w-full items-center justify-center bg-gray-900 text-white">
                        Cuộc gọi đã kết thúc
                  </div>
            );
      }

      return (
            <div className="relative flex h-full w-full flex-col bg-gray-900">
                  {/* ── Main view area ────────────────────────────────────────────── */}
                  <div className="flex-1 overflow-hidden">
                        {provider === 'DAILY_CO' ? (
                              <DailyCallView />
                        ) : callType === 'VIDEO' ? (
                              <VideoCallView />
                        ) : (
                              <VoiceCallView />
                        )}
                  </div>

                  {/* ── Reconnecting overlay (absolute over main view) ─────────── */}
                  {callStatus === 'RECONNECTING' && (
                        <ReconnectingOverlay onHangup={handleHangup} />
                  )}

                  {/* ── Controls bar (fixed bottom) ───────────────────────────── */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent">
                        <CallControls onHangup={handleHangup} />
                  </div>
            </div>
      );
}
