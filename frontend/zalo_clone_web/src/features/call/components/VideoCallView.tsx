/**
 * VideoCallView — Full-screen video layout for active video call.
 *
 * Layout:
 * - Remote video fills the screen
 * - Local video in a small PiP (picture-in-picture) corner
 * - Tap/click toggles controls visibility
 * - Quality indicator in top-left corner
 *
 * Explicit variant: used instead of <CallView isVideo={true}>.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { useCallStore } from '../stores/call.store';
import { QualityIndicator } from './QualityIndicator';

export function VideoCallView() {
      const localStream = useCallStore((s) => s.localStream);
      const remoteStream = useCallStore((s) => s.remoteStream);
      const connectionQuality = useCallStore((s) => s.connectionQuality);
      const [showControls, setShowControls] = useState(true);

      const remoteVideoRef = useRef<HTMLVideoElement>(null);
      const localVideoRef = useRef<HTMLVideoElement>(null);

      // ── Attach streams to video elements ────────────────────────────────
      useEffect(() => {
            if (remoteVideoRef.current && remoteStream) {
                  remoteVideoRef.current.srcObject = remoteStream;
            }
      }, [remoteStream]);

      useEffect(() => {
            if (localVideoRef.current && localStream) {
                  localVideoRef.current.srcObject = localStream;
            }
      }, [localStream]);

      // ── Toggle controls visibility ──────────────────────────────────────
      const handleToggleControls = useCallback(() => {
            setShowControls((v) => !v);
      }, []);

      // Auto-hide controls after 5s
      useEffect(() => {
            if (!showControls) return;

            const timer = setTimeout(() => setShowControls(false), 5000);
            return () => clearTimeout(timer);
      }, [showControls]);

      return (
            <div
                  className="relative h-full w-full bg-black cursor-pointer"
                  onClick={handleToggleControls}
            >
                  {/* Remote video — full screen */}
                  <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="h-full w-full object-cover"
                  />

                  {/* No remote stream placeholder */}
                  {!remoteStream && (
                        <div className="absolute inset-0 flex items-center justify-center">
                              <div className="text-white/60 text-lg">Đang chờ kết nối video…</div>
                        </div>
                  )}

                  {/* Local video — PiP bottom-right */}
                  <div className="absolute bottom-24 right-4 h-40 w-28 overflow-hidden rounded-xl border-2 border-white/30 shadow-lg">
                        <video
                              ref={localVideoRef}
                              autoPlay
                              playsInline
                              muted
                              className="h-full w-full object-cover mirror"
                              style={{ transform: 'scaleX(-1)' }}
                        />
                  </div>

                  {/* Quality indicator — top left */}
                  <div className="absolute top-4 left-4 z-10">
                        <QualityIndicator quality={connectionQuality} />
                  </div>

                  {/* Controls visibility indicator (dot) */}
                  {!showControls && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 h-1 w-8 rounded bg-white/40" />
                  )}
            </div>
      );
}

/** Export showControls consumer for CallScreen */
VideoCallView.displayName = 'VideoCallView';
