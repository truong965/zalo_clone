/**
 * VoiceCallView — Layout for active voice call.
 *
 * Layout:
 * - Large avatar centered
 * - Peer display name
 * - Duration timer
 * - CSS-only waveform animation (lightweight, no canvas)
 * - Quality indicator
 *
 * Explicit variant: used instead of <CallView isVideo={false}>.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Avatar, Typography } from 'antd';
import { useCallStore } from '../stores/call.store';
import { QualityIndicator } from './QualityIndicator';

const { Title, Text } = Typography;

export function VoiceCallView() {
      const peerInfo = useCallStore((s) => s.peerInfo);
      const callDuration = useCallStore((s) => s.callDuration);
      const callStatus = useCallStore((s) => s.callStatus);
      const connectionQuality = useCallStore((s) => s.connectionQuality);
      const remoteStream = useCallStore((s) => s.remoteStream);

      const audioRef = useRef<HTMLAudioElement>(null);

      // Attach remote stream to hidden <audio> for playback
      useEffect(() => {
            if (audioRef.current && remoteStream) {
                  audioRef.current.srcObject = remoteStream;
            }
      }, [remoteStream]);

      const formattedDuration = useMemo(() => {
            const mins = Math.floor(callDuration / 60);
            const secs = callDuration % 60;
            return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }, [callDuration]);

      const statusText = useMemo(() => {
            switch (callStatus) {
                  case 'DIALING':
                        return 'Đang gọi…';
                  case 'RINGING':
                        return 'Đang đổ chuông…';
                  case 'RECONNECTING':
                        return 'Đang kết nối lại…';
                  case 'ACTIVE':
                        return formattedDuration;
                  default:
                        return '';
            }
      }, [callStatus, formattedDuration]);

      return (
            <div className="relative flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900">
                  {/* Hidden audio element for remote stream playback */}
                  <audio ref={audioRef} autoPlay playsInline />

                  {/* Quality indicator */}
                  <div className="absolute top-4 left-4">
                        <QualityIndicator quality={connectionQuality} />
                  </div>

                  {/* Avatar with pulse animation during ringing */}
                  <div className="relative mb-6">
                        {(callStatus === 'DIALING' || callStatus === 'RINGING') && (
                              <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/20" />
                        )}
                        <Avatar
                              size={120}
                              src={peerInfo?.avatarUrl ?? undefined}
                              className="bg-blue-500 relative z-10 text-4xl"
                        >
                              {peerInfo?.displayName?.[0]?.toUpperCase() ?? '?'}
                        </Avatar>
                  </div>

                  {/* Peer name */}
                  <Title level={3} className="!text-white !mb-2">
                        {peerInfo?.displayName ?? 'Đang gọi…'}
                  </Title>

                  {/* Status / Duration */}
                  <Text className="!text-gray-400 text-lg tabular-nums">{statusText}</Text>

                  {/* CSS-only waveform animation (only during ACTIVE) */}
                  {callStatus === 'ACTIVE' && (
                        <div className="mt-8 flex items-end gap-1">
                              {[0, 1, 2, 3, 4].map((i) => (
                                    <div
                                          key={i}
                                          className="w-1 rounded-full bg-blue-400"
                                          style={{
                                                animation: `voice-wave 1.2s ease-in-out ${i * 0.1}s infinite`,
                                                height: '16px',
                                          }}
                                    />
                              ))}
                        </div>
                  )}

                  {/* Inline keyframes for voice waveform */}
                  <style>{`
        @keyframes voice-wave {
          0%, 100% { height: 8px; opacity: 0.5; }
          50% { height: 24px; opacity: 1; }
        }
      `}</style>
            </div>
      );
}
