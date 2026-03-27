import React from 'react';
import { Button, Avatar } from 'antd';
import { PhoneOutlined } from '@ant-design/icons';
import { useCallStore } from '@/features/call/stores/call.store';
import type { PeerInfo } from '@/features/call/types';
import { motion, AnimatePresence } from 'framer-motion';

interface ActiveGroupCallBannerProps {
      conversationId: string;
      displayName: string;
      avatarUrl?: string | null;
}

/**
 * ActiveGroupCallBanner
 * 
 * Displays a proactive "Join Call" banner in the chat header when 
 * an active group call is detected.
 */
export const ActiveGroupCallBanner: React.FC<ActiveGroupCallBannerProps> = ({
      conversationId,
      displayName,
      avatarUrl
}) => {
      const activeGroupCalls = useCallStore((s) => s.activeGroupCalls);
      const callStatus = useCallStore((s) => s.callStatus);
      const currentCallConversationId = useCallStore((s) => s.conversationId);

      // Phase 6: activeGroupCalls values are now { active, roomUrl } objects
      const groupCallState = activeGroupCalls[conversationId];
      const isActive = groupCallState?.active === true;

      // Hide banner if:
      // 1. No active group call detected for this conversation
      // 2. OR user is already actively participating in a call for THIS conversation
      const shouldShow = isActive && !(callStatus === 'ACTIVE' && currentCallConversationId === conversationId);

      if (!shouldShow) return null;

      const handleJoin = () => {
            const peerInfo: PeerInfo = {
                  displayName,
                  avatarUrl: avatarUrl ?? null,
            };

            // Emit custom event for CallManager to pick up
            // This mirrors the logic in ChatHeader
            const event = new CustomEvent('call:join-existing', {
                  detail: { conversationId, peerInfo }
            });
            window.dispatchEvent(event);
      };

      return (
            <AnimatePresence>
                  <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                  >
                        <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-100 shadow-md mx-4 my-2 rounded-xl">
                              <div className="flex items-center gap-3">
                                    <div className="relative">
                                          <Avatar 
                                                src={avatarUrl} 
                                                size={40}
                                                className="border-2 border-white shadow-sm"
                                          >
                                                {displayName.charAt(0).toUpperCase()}
                                          </Avatar>
                                          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full animate-pulse" />
                                    </div>
                                    
                                    <div className="flex flex-col">
                                          <span className="text-sm font-semibold text-blue-900">
                                                Cuộc gọi nhóm đang diễn ra
                                          </span>
                                          <span className="text-xs text-blue-600">
                                                Nhấn để tham gia cùng mọi người
                                          </span>
                                    </div>
                              </div>

                              <div className="flex items-center gap-2">
                                    <Button
                                          type="primary"
                                          icon={<PhoneOutlined />}
                                          onClick={handleJoin}
                                          className="bg-blue-600 hover:bg-blue-700 border-none rounded-full flex items-center px-4"
                                    >
                                          Tham gia
                                    </Button>
                              </div>
                        </div>
                  </motion.div>
            </AnimatePresence>
      );
};
