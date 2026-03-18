import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { Message } from '@/types/message';
import { Ionicons } from '@expo/vector-icons';

interface SystemMessageProps {
      message: Message;
}

interface CallLogMeta {
      action: string;
      callType?: 'VOICE' | 'VIDEO';
      status?: 'COMPLETED' | 'MISSED' | 'REJECTED' | 'CANCELLED' | 'NO_ANSWER' | 'FAILED';
      duration?: number; // seconds
}

function formatCallDuration(seconds: number): string {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      if (m === 0) return `${s}s`;
      if (s === 0) return `${m}m`;
      return `${m}m ${s}s`;
}

function getCallLogLabel(meta: CallLogMeta): string {
      const typeLabel = meta.callType === 'VIDEO' ? 'Video' : 'Gọi';
      switch (meta.status) {
            case 'COMPLETED':
                  return `${typeLabel}${meta.duration ? ` · ${formatCallDuration(meta.duration)}` : ''}`;
            case 'MISSED':
                  return `${typeLabel} nhỡ`;
            case 'REJECTED':
                  return `${typeLabel} bị từ chối`;
            case 'CANCELLED':
                  return `${typeLabel} đã huỷ`;
            case 'NO_ANSWER':
                  return `${typeLabel} không được trả lời`;
            case 'FAILED':
                  return `${typeLabel} thất bại`;
            default:
                  return `${typeLabel}`;
      }
}

export function SystemMessage({ message }: SystemMessageProps) {
      const meta = (message.metadata ?? {}) as unknown as CallLogMeta;

      if (meta.action !== 'CALL_LOG') {
            // Generic system message fallback
            return (
                  <View className="flex justify-center py-1">
                        <View className="self-center">
                              <Text className="text-[11px] text-gray-400 italic px-3 py-1 bg-gray-100 rounded-full">
                                    {message.content || 'Sự kiện hệ thống'}
                              </Text>
                        </View>
                  </View>
            );
      }

      const isVideo = meta.callType === 'VIDEO';
      const isMissed = meta.status === 'MISSED' || meta.status === 'NO_ANSWER';

      const IconName = isVideo
            ? isMissed
                  ? 'videocam-off-outline'
                  : 'videocam-outline'
            : isMissed
                  ? 'call-outline'
                  : 'call';

      return (
            <View className="flex justify-center py-0.5">
                  <View className="self-center flex-row items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100">
                        <Ionicons
                              name={IconName as any}
                              size={12}
                              color={isMissed ? '#ef4444' : '#3b82f6'}
                        />
                        <Text className={`text-[12px] ${isMissed ? 'text-red-500' : 'text-gray-600'}`}>
                              {getCallLogLabel(meta)}
                        </Text>
                  </View>
            </View>
      );
}
