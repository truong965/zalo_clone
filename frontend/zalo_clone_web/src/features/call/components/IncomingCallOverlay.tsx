/**
 * IncomingCallOverlay — Full-screen overlay for incoming call notification.
 *
 * Mounted at App root level. Renders when callStore.incomingCall !== null.
 * Features:
 * - Caller avatar, name, call type indicator
 * - Accept / Decline buttons
 * - 30s auto-reject countdown
 * - Ringtone audio (Web Audio API oscillator, works without audio files)
 *
 * Composition pattern: explicit variant (not boolean props).
 */

import { useEffect, useRef, useCallback } from 'react';
import { Avatar, Badge, Button, Typography } from 'antd';
import { PhoneOutlined, CloseOutlined, VideoCameraOutlined, TeamOutlined } from '@ant-design/icons';
import { useCallStore } from '../stores/call.store';

const { Title, Text } = Typography;

/** Auto-reject after this many seconds */
const RINGING_TIMEOUT_S = 30;

export function IncomingCallOverlay() {
      const incomingCall = useCallStore((s) => s.incomingCall);
      const resetCallState = useCallStore((s) => s.resetCallState);
      const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
      const audioCtxRef = useRef<AudioContext | null>(null);
      const oscillatorRef = useRef<OscillatorNode | null>(null);
      const timeLeftRef = useRef(RINGING_TIMEOUT_S);

      // ── Accept / Reject handlers ────────────────────────────────────────
      // These are handled by CallManager's useCallSocket + useWebRTCCall,
      // but we need to emit via socket. We'll use the store's callId.

      const handleAccept = useCallback(() => {
            const { callId } = useCallStore.getState();
            if (!callId) return;

            // Dispatch event for CallManager to handle accept logic
            // (P2P or Daily.co join depending on call type)
            window.dispatchEvent(new CustomEvent('call:accept-incoming'));
      }, []);

      const handleReject = useCallback(() => {
            const { callId } = useCallStore.getState();
            if (!callId) return;

            // Dispatch reject event for CallManager
            window.dispatchEvent(new CustomEvent('call:reject-incoming'));
            resetCallState();
      }, [resetCallState]);

      // ── Ringtone (Web Audio oscillator) ─────────────────────────────────

      const startRingtone = useCallback(() => {
            try {
                  const ctx = new AudioContext();
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();

                  osc.type = 'sine';
                  osc.frequency.value = 440;
                  gain.gain.value = 0.1;

                  osc.connect(gain);
                  gain.connect(ctx.destination);

                  // Ring pattern: 1s on, 2s off (via gain modulation)
                  const now = ctx.currentTime;
                  for (let i = 0; i < 10; i++) {
                        gain.gain.setValueAtTime(0.1, now + i * 3);
                        gain.gain.setValueAtTime(0, now + i * 3 + 1);
                  }

                  osc.start();
                  audioCtxRef.current = ctx;
                  oscillatorRef.current = osc;
            } catch {
                  // Audio may not be available
            }
      }, []);

      const stopRingtone = useCallback(() => {
            try {
                  oscillatorRef.current?.stop();
                  oscillatorRef.current?.disconnect();
                  void audioCtxRef.current?.close();
            } catch {
                  // Ignore cleanup errors
            }
            oscillatorRef.current = null;
            audioCtxRef.current = null;
      }, []);

      // ── Lifecycle ───────────────────────────────────────────────────────

      useEffect(() => {
            if (!incomingCall) {
                  stopRingtone();
                  if (countdownRef.current) {
                        clearInterval(countdownRef.current);
                        countdownRef.current = null;
                  }
                  return;
            }

            // Start ringtone
            startRingtone();

            // Start countdown timer
            timeLeftRef.current = RINGING_TIMEOUT_S;
            countdownRef.current = setInterval(() => {
                  timeLeftRef.current -= 1;
                  if (timeLeftRef.current <= 0) {
                        // Auto-reject on timeout
                        handleReject();
                  }
            }, 1000);

            return () => {
                  stopRingtone();
                  if (countdownRef.current) {
                        clearInterval(countdownRef.current);
                        countdownRef.current = null;
                  }
            };
      }, [incomingCall, startRingtone, stopRingtone, handleReject]);

      // ── Render ──────────────────────────────────────────────────────────

      if (!incomingCall) return null;

      const isVideo = incomingCall.callType === 'VIDEO';
      const isGroup = incomingCall.isGroupCall ?? false;
      const participantCount = incomingCall.participantCount ?? 0;
      const conversationName = incomingCall.conversationName ?? null;
      const { callerInfo } = incomingCall;

      // For group calls: prefer conversation name, fallback to caller's name
      const displayTitle = isGroup
            ? (conversationName || `Nhóm của ${callerInfo.displayName}`)
            : callerInfo.displayName;

      return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-6 rounded-2xl bg-gray-900 p-8 text-white shadow-2xl min-w-[320px]">
                        {/* Call type indicator */}
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                              {isGroup ? <TeamOutlined /> : isVideo ? <VideoCameraOutlined /> : <PhoneOutlined />}
                              <span>
                                    {isGroup
                                          ? `Cuộc gọi nhóm${isVideo ? ' video' : ''} đến`
                                          : isVideo
                                                ? 'Cuộc gọi video đến'
                                                : 'Cuộc gọi thoại đến'}
                              </span>
                              {isGroup && participantCount > 0 && (
                                    <Badge
                                          count={participantCount}
                                          style={{ backgroundColor: '#1890ff' }}
                                          title={`${participantCount} người tham gia`}
                                    />
                              )}
                        </div>

                        {/* Avatar: group shows initiator avatar + group badge */}
                        <div className="relative">
                              <div className="absolute inset-0 animate-ping rounded-full bg-green-500/30" />
                              <Avatar
                                    size={96}
                                    src={callerInfo.avatarUrl ?? undefined}
                                    className="bg-blue-500 relative z-10"
                              >
                                    {callerInfo.displayName?.[0]?.toUpperCase() ?? '?'}
                              </Avatar>
                              {isGroup && (
                                    <span className="absolute -bottom-1 -right-1 z-20 bg-blue-500 rounded-full w-8 h-8 flex items-center justify-center border-2 border-gray-900">
                                          <TeamOutlined className="text-white text-sm" />
                                    </span>
                              )}
                        </div>

                        {/* Title: group name or caller name */}
                        <div className="text-center">
                              <Title level={4} className="!text-white !mb-1">
                                    {displayTitle}
                              </Title>
                              <Text className="!text-gray-400 text-sm">
                                    {isGroup
                                          ? `${callerInfo.displayName} đang mời bạn vào cuộc gọi nhóm…`
                                          : 'Đang gọi cho bạn…'}
                              </Text>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-12 mt-4">
                              {/* Decline */}
                              <div className="flex flex-col items-center gap-2">
                                    <Button
                                          shape="circle"
                                          size="large"
                                          danger
                                          icon={<CloseOutlined />}
                                          onClick={handleReject}
                                          className="!w-16 !h-16 !text-xl"
                                    />
                                    <Text className="!text-gray-400 text-xs">Từ chối</Text>
                              </div>

                              {/* Accept */}
                              <div className="flex flex-col items-center gap-2">
                                    <Button
                                          shape="circle"
                                          size="large"
                                          icon={isVideo ? <VideoCameraOutlined /> : <PhoneOutlined />}
                                          onClick={handleAccept}
                                          className="!w-16 !h-16 !text-xl !bg-green-500 !border-green-500 !text-white hover:!bg-green-600"
                                    />
                                    <Text className="!text-gray-400 text-xs">Chấp nhận</Text>
                              </div>
                        </div>
                  </div>
            </div>
      );
}
