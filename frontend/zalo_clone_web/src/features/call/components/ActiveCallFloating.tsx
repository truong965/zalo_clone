/**
 * ActiveCallFloating — Floating pill shown when user navigates away from call.
 *
 * Mounted at App root. Renders when callStatus is ACTIVE and the user
 * is not on the /calls/:callId route. Shows duration timer + click to return.
 *
 * Uses position: fixed + high z-index for overlay behavior.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhoneOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { useCallStore } from '../stores/call.store';

export function ActiveCallFloating() {
      const callStatus = useCallStore((s) => s.callStatus);
      const callType = useCallStore((s) => s.callType);
      const callDuration = useCallStore((s) => s.callDuration);
      const peerInfo = useCallStore((s) => s.peerInfo);
      const callId = useCallStore((s) => s.callId);
      const navigate = useNavigate();

      const formattedDuration = useMemo(() => {
            const mins = Math.floor(callDuration / 60);
            const secs = callDuration % 60;
            return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }, [callDuration]);

      if (callStatus !== 'ACTIVE' && callStatus !== 'RECONNECTING') return null;

      const handleClick = () => {
            if (callId) {
                  navigate(`/calls/${callId}`);
            }
      };

      return (
            <button
                  type="button"
                  onClick={handleClick}
                  className="fixed top-4 right-4 z-[9998] flex items-center gap-3 rounded-full bg-green-600 px-4 py-2 text-white shadow-lg transition-all hover:bg-green-700 cursor-pointer"
            >
                  {callType === 'VIDEO' ? (
                        <VideoCameraOutlined className="text-lg" />
                  ) : (
                        <PhoneOutlined className="text-lg" />
                  )}
                  <div className="flex flex-col items-start text-sm leading-tight">
                        <span className="font-medium truncate max-w-[120px]">
                              {peerInfo?.displayName ?? 'Cuộc gọi'}
                        </span>
                        <span className="text-green-200 text-xs tabular-nums">
                              {callStatus === 'RECONNECTING' ? 'Đang kết nối lại…' : formattedDuration}
                        </span>
                  </div>
                  <div className="ml-1 h-2 w-2 animate-pulse rounded-full bg-green-300" />
            </button>
      );
}
