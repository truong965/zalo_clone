/**
 * DailyCallView — Video grid layout for Daily.co SFU calls.
 *
 * Renders when callStore.provider === 'DAILY_CO'.
 * Dynamically adjusts grid layout based on participant count:
 * - 1 participant: full screen
 * - 2 participants: side by side or stacked
 * - 3-4 participants: 2x2 grid
 * - 5-9 participants: 3x3 grid
 *
 * Reuses <QualityIndicator> from P2P call.
 * Composition: explicit variant component (not boolean prop).
 *
 * Following vercel-composition-patterns: explicit variants over boolean props.
 * Following vercel-react-best-practices: rendering-conditional-render (ternary).
 */

import { useRef, useEffect } from 'react';
import { useCallStore } from '../stores/call.store';
import { useDailyCall } from '../hooks/use-daily-call';
import { useAuthStore } from '@/features/auth';
import { useTranslation } from 'react-i18next';

/**
 * DailyCallView — Renders Daily.co Prebuilt UI in an iframe.
 * 
 * Instead of a custom grid, we use Daily's optimized Prebuilt UI.
 * This provides features like screen sharing, chat, and device settings
 * out of the box.
 */
export function DailyCallView() {
      const containerRef = useRef<HTMLDivElement>(null);
      const { join, cleanup } = useDailyCall();
      const { t } = useTranslation();
      
      const dailyRoomUrl = useCallStore((s) => s.dailyRoomUrl);
      const dailyToken = useCallStore((s) => s.dailyToken);
      const callType = useCallStore((s) => s.callType);
      const callStatus = useCallStore((s) => s.callStatus);
      const user = useAuthStore((s) => s.user);

      useEffect(() => {
            if (!containerRef.current || !dailyRoomUrl || !dailyToken || callStatus !== 'ACTIVE') {
                  return;
            }

            // Initialize Daily Prebuilt
            const avatarUrl = user?.avatarUrl ?? undefined;
            void join(containerRef.current, dailyRoomUrl, dailyToken, callType ?? undefined, avatarUrl);

            return () => {
                  void cleanup();
            };
      }, [dailyRoomUrl, dailyToken, callType, callStatus, user?.avatarUrl, join, cleanup]);

      return (
            <div className="relative h-full w-full bg-gray-900 overflow-hidden flex flex-col">
                  {/* Container for Daily Prebuilt iframe */}
                  <div 
                        ref={containerRef} 
                        className="flex-1 w-full h-full min-h-0"
                  />

                  {/* Loading state if not yet joined */}
                  {!dailyRoomUrl && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
                              <div className="text-white/60 text-lg animate-pulse">
                                    {t('call.dailyConnecting')}
                              </div>
                        </div>
                  )}
            </div>
      );
}

DailyCallView.displayName = 'DailyCallView';
