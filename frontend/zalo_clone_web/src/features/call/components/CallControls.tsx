/**
 * CallControls — Explicit variant buttons for call actions.
 *
 * Composition pattern: each button is a standalone component, composed
 * into CallControls. No boolean-prop proliferation.
 *
 * Variants: MuteButton, CameraButton, HangupButton, SpeakerButton.
 */

import { Button, Tooltip } from 'antd';
import {
      AudioOutlined,
      AudioMutedOutlined,
      VideoCameraOutlined,
      // Using a workaround icon for camera off (no direct AntD icon)
      StopOutlined,
      PhoneOutlined,
      SoundOutlined,
} from '@ant-design/icons';
import { useCallStore } from '../stores/call.store';

// ============================================================================
// INDIVIDUAL BUTTON VARIANTS
// ============================================================================

export function MuteButton() {
      const isMuted = useCallStore((s) => s.isMuted);
      const toggleMute = useCallStore((s) => s.toggleMute);

      return (
            <Tooltip title={isMuted ? 'Bật micro' : 'Tắt micro'}>
                  <Button
                        shape="circle"
                        size="large"
                        icon={isMuted ? <AudioMutedOutlined /> : <AudioOutlined />}
                        onClick={toggleMute}
                        className={`!w-14 !h-14 !text-lg ${isMuted
                                    ? '!bg-red-500/20 !border-red-500 !text-red-400'
                                    : '!bg-white/10 !border-white/20 !text-white'
                              }`}
                  />
            </Tooltip>
      );
}

export function CameraButton() {
      const isCameraOff = useCallStore((s) => s.isCameraOff);
      const toggleCamera = useCallStore((s) => s.toggleCamera);
      const callType = useCallStore((s) => s.callType);

      // Only show for video calls
      if (callType !== 'VIDEO') return null;

      return (
            <Tooltip title={isCameraOff ? 'Bật camera' : 'Tắt camera'}>
                  <Button
                        shape="circle"
                        size="large"
                        icon={isCameraOff ? <StopOutlined /> : <VideoCameraOutlined />}
                        onClick={toggleCamera}
                        className={`!w-14 !h-14 !text-lg ${isCameraOff
                                    ? '!bg-red-500/20 !border-red-500 !text-red-400'
                                    : '!bg-white/10 !border-white/20 !text-white'
                              }`}
                  />
            </Tooltip>
      );
}

interface HangupButtonProps {
      onHangup: () => void;
}

export function HangupButton({ onHangup }: HangupButtonProps) {
      return (
            <Tooltip title="Kết thúc cuộc gọi">
                  <Button
                        shape="circle"
                        size="large"
                        danger
                        icon={<PhoneOutlined className="rotate-[135deg]" />}
                        onClick={onHangup}
                        className="!w-14 !h-14 !text-lg !bg-red-500 !border-red-500 !text-white hover:!bg-red-600"
                  />
            </Tooltip>
      );
}

export function SpeakerButton() {
      const isSpeakerOn = useCallStore((s) => s.isSpeakerOn);
      const toggleSpeaker = useCallStore((s) => s.toggleSpeaker);

      return (
            <Tooltip title={isSpeakerOn ? 'Tắt loa' : 'Bật loa'}>
                  <Button
                        shape="circle"
                        size="large"
                        icon={<SoundOutlined />}
                        onClick={toggleSpeaker}
                        className={`!w-14 !h-14 !text-lg ${isSpeakerOn
                                    ? '!bg-white/10 !border-white/20 !text-white'
                                    : '!bg-white/20 !border-white/30 !text-gray-400'
                              }`}
                  />
            </Tooltip>
      );
}

// ============================================================================
// COMPOSED CONTROLS BAR
// ============================================================================

interface CallControlsProps {
      onHangup: () => void;
}

export function CallControls({ onHangup }: CallControlsProps) {
      return (
            <div className="flex items-center justify-center gap-6 py-6">
                  <MuteButton />
                  <CameraButton />
                  <HangupButton onHangup={onHangup} />
                  <SpeakerButton />
            </div>
      );
}
