/**
 * ReconnectingOverlay — Shown during ICE reconnection attempts.
 *
 * Phase 6 enhanced:
 * - Shows elapsed reconnection time as countdown
 * - "End call" button appears only after 12s (SHOW_END_BUTTON_MS)
 * - Auto-end warning shown near 30s timeout
 * - Spinner + status message throughout
 *
 * Rendered when callStatus === 'RECONNECTING'.
 *
 * Following vercel-react-best-practices:
 * - rerender-use-ref-transient-values: Timer interval uses state only
 *   for the single counter value, not refs (needs re-render for UI)
 */

import { useState, useEffect, useRef } from 'react';
import { Button, Spin, Typography } from 'antd';
import { PhoneOutlined } from '@ant-design/icons';
import { useCallStore } from '../stores/call.store';

const { Text, Title } = Typography;

// ── Phase 6 reconnection thresholds ────────────────────────────────────
/** Show "End call" button after this many seconds */
const SHOW_END_BUTTON_S = 12;
/** Auto end / Daily.co fallback at this many seconds */
const AUTO_END_TIMEOUT_S = 30;

interface ReconnectingOverlayProps {
      onHangup: () => void;
}

export function ReconnectingOverlay({ onHangup }: ReconnectingOverlayProps) {
      const peerInfo = useCallStore((s) => s.peerInfo);
      const reconnectStartedAt = useCallStore((s) => s.reconnectStartedAt);

      // ── Elapsed time counter (re-renders once per second for UI) ──────
      const [elapsedS, setElapsedS] = useState(0);
      const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

      useEffect(() => {
            // Compute initial elapsed from reconnectStartedAt
            const start = reconnectStartedAt ?? Date.now();
            setElapsedS(Math.floor((Date.now() - start) / 1_000));

            timerRef.current = setInterval(() => {
                  setElapsedS(Math.floor((Date.now() - start) / 1_000));
            }, 1_000);

            return () => {
                  if (timerRef.current) {
                        clearInterval(timerRef.current);
                        timerRef.current = null;
                  }
            };
      }, [reconnectStartedAt]);

      const showEndButton = elapsedS >= SHOW_END_BUTTON_S;
      const remainingS = Math.max(AUTO_END_TIMEOUT_S - elapsedS, 0);
      const nearAutoEnd = elapsedS >= AUTO_END_TIMEOUT_S - 5; // Last 5 seconds

      // ── Status message based on phase ─────────────────────────────────
      let statusMessage: string;
      if (elapsedS < 6) {
            statusMessage = `Đang kết nối lại với ${peerInfo?.displayName ?? 'đối phương'}…`;
      } else if (elapsedS < SHOW_END_BUTTON_S) {
            statusMessage = 'Đang thử kết nối lại lần 2…';
      } else if (nearAutoEnd) {
            statusMessage = `Kết nối sẽ tự động kết thúc sau ${remainingS}s`;
      } else {
            statusMessage = 'Kết nối kém, đang thử lại…';
      }

      return (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
                  <Spin size="large" />

                  <Title level={4} className="!text-white !mt-6 !mb-2">
                        Đang kết nối lại…
                  </Title>

                  <Text className="!text-gray-400 mb-2">
                        {statusMessage}
                  </Text>

                  {/* Elapsed time indicator */}
                  <Text className="!text-gray-500 text-xs mb-8 tabular-nums">
                        {elapsedS}s / {AUTO_END_TIMEOUT_S}s
                  </Text>

                  {/* End call button — appears after SHOW_END_BUTTON_S */}
                  {showEndButton && (
                        <Button
                              type="primary"
                              danger
                              size="large"
                              icon={<PhoneOutlined className="rotate-[135deg]" />}
                              onClick={onHangup}
                        >
                              Kết thúc cuộc gọi
                        </Button>
                  )}
            </div>
      );
}
