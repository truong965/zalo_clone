/**
 * CallScreen — Compound component for the full-screen call view.
 *
 * Renders VideoCallView or DailyCallView based on
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
import { DailyCallView } from './DailyCallView';
import { CallControls } from './CallControls';
import { ReconnectingOverlay } from './ReconnectingOverlay';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
export function CallScreen() {
      const callStatus = useCallStore((s) => s.callStatus);
      const provider = useCallStore((s) => s.provider);
      const { t } = useTranslation();
      const navigate = useNavigate();

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

      // ── Auto-navigate away when call ends ───────────────────────────────
      useEffect(() => {
            if (callStatus === 'IDLE' || callStatus === 'ENDED') {
                  const timer = setTimeout(() => {
                        navigate('/');
                  }, 2000);
                  return () => clearTimeout(timer);
            }
      }, [callStatus, navigate]);

      // If no active call, render nothing (fallback)
      if (callStatus === 'IDLE' || callStatus === 'ENDED') {
            return (
                  <div className="flex h-full w-full items-center justify-center bg-gray-900 text-white">
                        {t('call.callHasEnded')}
                  </div>
            );
      }

      return (

            <div className="relative flex h-full w-full flex-col bg-gray-900">
                  {/* ── Main view area ────────────────────────────────────────────── */}
                  <div className="flex-1 overflow-hidden">
                        {provider === 'DAILY_CO' ? (
                              <DailyCallView />
                        ) : (
                              <VideoCallView />
                        )}
                  </div>

                  {/* ── Reconnecting overlay (absolute over main view) ─────────── */}
                  {callStatus === 'RECONNECTING' && (
                        <ReconnectingOverlay onHangup={handleHangup} />
                  )}

                  {/* ── Controls bar (hidden for Daily Prebuilt) ──────────── */}
                  {provider !== 'DAILY_CO' && (
                        <div className="shrink-0 bg-gray-900/95">
                              <CallControls onHangup={handleHangup} />
                        </div>
                  )}
            </div>
      );
}
