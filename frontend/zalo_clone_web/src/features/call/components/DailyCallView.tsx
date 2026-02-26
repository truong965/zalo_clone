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

import { useRef, useEffect, useCallback } from 'react';
import { useCallStore } from '../stores/call.store';
import { QualityIndicator } from './QualityIndicator';
import type { DailyParticipant } from '../types';

// ============================================================================
// PARTICIPANT TILE
// ============================================================================

function ParticipantTile({ participant }: { participant: DailyParticipant }) {
      const videoRef = useRef<HTMLVideoElement>(null);

      useEffect(() => {
            const el = videoRef.current;
            if (!el) return;

            if (participant.videoTrack) {
                  el.srcObject = new MediaStream([participant.videoTrack]);
            } else {
                  el.srcObject = null;
            }
      }, [participant.videoTrack]);

      // Attach audio only for remote participants
      const audioRef = useRef<HTMLAudioElement>(null);
      useEffect(() => {
            const el = audioRef.current;
            if (!el || participant.isLocal) return;

            if (participant.audioTrack) {
                  el.srcObject = new MediaStream([participant.audioTrack]);
            } else {
                  el.srcObject = null;
            }
      }, [participant.audioTrack, participant.isLocal]);

      return (
            <div className="relative flex items-center justify-center overflow-hidden rounded-lg bg-gray-800">
                  {/* Video */}
                  {participant.videoEnabled && participant.videoTrack ? (
                        <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              muted={participant.isLocal}
                              className={`h-full w-full object-cover ${participant.isLocal ? 'scale-x-[-1]' : ''}`}
                        />
                  ) : (
                        <div className="flex h-full w-full items-center justify-center">
                              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white">
                                    {participant.displayName.charAt(0).toUpperCase()}
                              </div>
                        </div>
                  )}

                  {/* Remote audio (hidden element) */}
                  {!participant.isLocal && (
                        <audio ref={audioRef} autoPlay playsInline />
                  )}

                  {/* Name + mute indicator */}
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                        {!participant.audioEnabled && (
                              <span className="text-red-400">🔇</span>
                        )}
                        <span>{participant.isLocal ? 'Bạn' : participant.displayName}</span>
                  </div>
            </div>
      );
}

// ============================================================================
// GRID LAYOUT
// ============================================================================

function getGridClass(count: number): string {
      if (count <= 1) return 'grid-cols-1 grid-rows-1';
      if (count === 2) return 'grid-cols-2 grid-rows-1';
      if (count <= 4) return 'grid-cols-2 grid-rows-2';
      return 'grid-cols-3 grid-rows-3';
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DailyCallView() {
      const participants = useCallStore((s) => s.dailyParticipants);
      const connectionQuality = useCallStore((s) => s.connectionQuality);

      // Sort: local user last so they appear in bottom-right
      const sorted = [...participants].sort((a, b) => {
            if (a.isLocal && !b.isLocal) return 1;
            if (!a.isLocal && b.isLocal) return -1;
            return 0;
      });

      const handleClick = useCallback(() => {
            // Future: toggle controls visibility
      }, []);

      return (
            <div
                  className="relative h-full w-full bg-gray-900 cursor-pointer"
                  onClick={handleClick}
            >
                  {/* Quality indicator */}
                  <div className="absolute left-3 top-3 z-10">
                        <QualityIndicator quality={connectionQuality} />
                  </div>

                  {/* Participant grid */}
                  <div className={`grid h-full w-full gap-1 p-1 ${getGridClass(sorted.length)}`}>
                        {sorted.map((participant) => (
                              <ParticipantTile
                                    key={participant.sessionId}
                                    participant={participant}
                              />
                        ))}
                  </div>

                  {/* Empty state */}
                  {participants.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                              <div className="text-white/60 text-lg">
                                    Đang kết nối Daily.co…
                              </div>
                        </div>
                  )}
            </div>
      );
}
