/**
 * OutgoingCallOverlay — Full-screen overlay shown to the CALLER while dialing.
 *
 * Renders when callStore.callStatus === 'DIALING'.
 * Shows: peer avatar, peer name, "Đang gọi..." indicator, and a Hangup button.
 * Disappears when:
 *   - Callee accepts → callStatus transitions to ACTIVE
 *   - Callee rejects → callStatus resets to IDLE
 *   - Caller hangs up → callStatus resets to IDLE
 *   - Server timeout (30s) → callStatus resets to IDLE
 *
 * Composition: explicit variant (VOICE / VIDEO) instead of boolean prop.
 */

import { useCallback } from 'react';
import { Avatar, Button, Typography } from 'antd';
import { PhoneOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { useCallStore } from '../stores/call.store';

const { Title, Text } = Typography;

export function OutgoingCallOverlay() {
      const callStatus = useCallStore((s) => s.callStatus);
      const callType = useCallStore((s) => s.callType);
      const peerInfo = useCallStore((s) => s.peerInfo);

      const handleHangup = useCallback(() => {
            window.dispatchEvent(new CustomEvent('call:hangup'));
      }, []);

      if (callStatus !== 'DIALING') return null;

      const isVideo = callType === 'VIDEO';

      return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-6 rounded-2xl bg-gray-900 p-8 text-white shadow-2xl min-w-[320px]">
                        {/* Call type indicator */}
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                              {isVideo ? <VideoCameraOutlined /> : <PhoneOutlined />}
                              <span>{isVideo ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}</span>
                        </div>

                        {/* Callee avatar with slow pulse animation */}
                        <div className="relative">
                              <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/20" />
                              <Avatar
                                    size={96}
                                    src={peerInfo?.avatarUrl ?? undefined}
                                    className="bg-blue-500 relative z-10"
                              >
                                    {peerInfo?.displayName?.[0]?.toUpperCase() ?? '?'}
                              </Avatar>
                        </div>

                        {/* Callee name + status */}
                        <div className="text-center">
                              <Title level={4} className="!text-white !mb-1">
                                    {peerInfo?.displayName ?? 'Đang gọi…'}
                              </Title>
                              <Text className="!text-gray-400 text-sm">Đang gọi…</Text>
                        </div>

                        {/* Hangup button */}
                        <div className="flex flex-col items-center gap-2 mt-4">
                              <Button
                                    shape="circle"
                                    size="large"
                                    danger
                                    icon={<PhoneOutlined className="rotate-[135deg]" />}
                                    onClick={handleHangup}
                                    className="!w-16 !h-16 !text-xl"
                              />
                              <Text className="!text-gray-400 text-xs">Kết thúc</Text>
                        </div>
                  </div>
            </div>
      );
}
