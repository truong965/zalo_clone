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
      const isCameraOff = useCallStore((s) => s.isCameraOff);
      const peerInfo = useCallStore((s) => s.peerInfo);
      const [showControls, setShowControls] = useState(true);

      // Detect if remote peer has their video tracks disabled
      const [remoteVideoOff, setRemoteVideoOff] = useState(false);

      useEffect(() => {
            const checkVideoTracks = () => {
                  if (!remoteStream) {
                        setRemoteVideoOff(false);
                        return;
                  }
                  const videoTracks = remoteStream.getVideoTracks();
                  setRemoteVideoOff(
                        videoTracks.length === 0 || videoTracks.every((t) => !t.enabled || t.muted),
                  );
            };

            // Schedule initial check asynchronously to avoid synchronous setState in effect body
            const timerId = setTimeout(checkVideoTracks, 0);

            remoteStream?.getVideoTracks().forEach((track) => {
                  track.addEventListener('mute', checkVideoTracks);
                  track.addEventListener('unmute', checkVideoTracks);
                  track.addEventListener('ended', checkVideoTracks);
            });

            return () => {
                  clearTimeout(timerId);
                  remoteStream?.getVideoTracks().forEach((track) => {
                        track.removeEventListener('mute', checkVideoTracks);
                        track.removeEventListener('unmute', checkVideoTracks);
                        track.removeEventListener('ended', checkVideoTracks);
                  });
            };
      }, [remoteStream]);

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
                        className={`h-full w-full object-cover ${remoteVideoOff || !remoteStream ? 'hidden' : ''}`}
                  />

                  {/* Remote camera off / waiting — show peer avatar */}
                  {(!remoteStream || remoteVideoOff) && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900">
                              {peerInfo?.avatarUrl ? (
                                    <img
                                          src={peerInfo.avatarUrl}
                                          alt={peerInfo.displayName}
                                          className="h-24 w-24 rounded-full object-cover ring-4 ring-white/20"
                                    />
                              ) : (
                                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-600 text-4xl font-bold text-white ring-4 ring-white/20">
                                          {peerInfo?.displayName?.charAt(0).toUpperCase() ?? '?'}
                                    </div>
                              )}
                              <span className="text-white/80 text-sm">
                                    {!remoteStream ? 'Đang chờ kết nối video…' : `${peerInfo?.displayName ?? 'Người dùng'} đã tắt camera`}
                              </span>
                        </div>
                  )}

                  {/* Local video — PiP bottom-right */}
                  <div className="absolute bottom-24 right-4 h-40 w-28 overflow-hidden rounded-xl border-2 border-white/30 shadow-lg bg-gray-800">
                        <video
                              ref={localVideoRef}
                              autoPlay
                              playsInline
                              muted
                              className={`h-full w-full object-cover mirror ${isCameraOff ? 'hidden' : ''}`}
                              style={{ transform: 'scaleX(-1)' }}
                        />
                        {/* Local camera off — show own avatar */}
                        {isCameraOff && (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white">
                                          Bạn
                                    </div>
                              </div>
                        )}
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
