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
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/features/auth';
import { getFullUrl } from '@/utils/url';
import { UserOutlined } from '@ant-design/icons';
export function VideoCallView() {
      const { t } = useTranslation();
      const localStream = useCallStore((s) => s.localStream);
      const remoteStream = useCallStore((s) => s.remoteStream);
      const connectionQuality = useCallStore((s) => s.connectionQuality);
      const isCameraOff = useCallStore((s) => s.isCameraOff);
      const peerCameraOff = useCallStore((s) => s.peerCameraOff);
      const peerInfo = useCallStore((s) => s.peerInfo);
      const user = useAuthStore((s) => s.user);
      const [showControls, setShowControls] = useState(true);

      // Detect if remote peer has their video tracks disabled
      const [remoteVideoOff, setRemoteVideoOff] = useState(false);
      const [peerAvatarError, setPeerAvatarError] = useState(false);
      const [userAvatarError, setUserAvatarError] = useState(false);

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
      const remoteAudioRef = useRef<HTMLAudioElement>(null);
      const localVideoRef = useRef<HTMLVideoElement>(null);

      useEffect(() => {
            if (remoteVideoRef.current && remoteStream) {
                  remoteVideoRef.current.srcObject = remoteStream;
            }
            if (remoteAudioRef.current && remoteStream) {
                  remoteAudioRef.current.srcObject = remoteStream;
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

      // ── Ensure video elements play when state changes ───────────────────
      useEffect(() => {
            if (!isCameraOff && localVideoRef.current) {
                  localVideoRef.current.play().catch((err) => {
                        console.warn('[VideoCallView] Failed to play local video:', err);
                  });
            }
      }, [isCameraOff]);

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
                        muted={remoteVideoOff} // Mute video element to rely solely on audio element for sound (prevents echo)
                        className="h-full w-full object-cover"
                  />

                  {/* Remote audio fallback — dedicated element to prevent playback stalling when video track is disabled */}
                  <audio
                        ref={remoteAudioRef}
                        autoPlay
                        className="hidden"
                  />

                  {/* Remote camera off / waiting — show peer avatar */}
                  {(!remoteStream || peerCameraOff || remoteVideoOff) && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900">
                              {getFullUrl(peerInfo?.avatarUrl) && !peerAvatarError ? (
                                    <img
                                          src={getFullUrl(peerInfo?.avatarUrl)}
                                          alt={peerInfo?.displayName}
                                          className="h-24 w-24 rounded-full object-cover ring-4 ring-white/20"
                                          onError={() => setPeerAvatarError(true)}
                                    />
                               ) : (
                                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-800 ring-4 ring-white/20">
                                          <UserOutlined className="text-4xl text-white/40" />
                                    </div>
                               ) }
                              <span className="text-white/80 text-sm">
                                    {!remoteStream
                                          ? t('call.waitingVideo')
                                          : `${peerInfo?.displayName ?? t('layout.client.defaultUser')} ${t('chat.header.cameraOff').toLowerCase()}`}
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
                              className={`h-full w-full object-cover ${isCameraOff ? 'hidden' : ''}`}
                              style={{ transform: 'scaleX(-1)' }}
                        />
                        {/* Local camera off — show own avatar */}
                        {isCameraOff && (
                              <div className="flex h-full w-full items-center justify-center bg-gray-800">
                                    {getFullUrl(user?.avatarUrl) && !userAvatarError ? (
                                          <img
                                                src={getFullUrl(user?.avatarUrl)}
                                                alt="Me"
                                                className="h-16 w-16 rounded-full object-cover border-2 border-white/20"
                                                onError={() => setUserAvatarError(true)}
                                          />
                                     ) : (
                                          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-700">
                                                <UserOutlined className="text-2xl text-white/30" />
                                          </div>
                                    )}
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
