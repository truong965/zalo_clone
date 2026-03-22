import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { Message } from '@/types/message';
import { Ionicons } from '@expo/vector-icons';

interface SystemMessageProps {
  message: Message;
}

interface CallLogMeta {
  action: string;
  callType?: 'VOICE' | 'VIDEO';
  status?: 'COMPLETED' | 'MISSED' | 'REJECTED' | 'CANCELLED' | 'NO_ANSWER' | 'FAILED';
  duration?: number;
}

function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function getCallLogLabel(meta: CallLogMeta): string {
  const typeLabel = meta.callType === 'VIDEO' ? 'Cuộc gọi video' : 'Cuộc gọi';
  switch (meta.status) {
    case 'COMPLETED':
      return `${typeLabel}${meta.duration ? ` · ${formatCallDuration(meta.duration)}` : ''}`;
    case 'MISSED': return `${typeLabel} nhỡ`;
    case 'REJECTED': return `${typeLabel} bị từ chối`;
    case 'CANCELLED': return `${typeLabel} đã huỷ`;
    case 'NO_ANSWER': return `${typeLabel} không trả lời`;
    case 'FAILED': return `${typeLabel} thất bại`;
    default: return typeLabel;
  }
}

export function SystemMessage({ message }: SystemMessageProps) {
  const theme = useTheme();
  const meta = (message.metadata ?? {}) as unknown as CallLogMeta;

  // 1. Render tin nhắn hệ thống thông thường
  if (meta.action !== 'CALL_LOG') {
    return (
      <View style={styles.container}>
        <View style={[styles.genericPill, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Text style={[styles.genericText, { color: theme.colors.onSurfaceVariant }]}>
            {message.content || 'Sự kiện hệ thống'}
          </Text>
        </View>
      </View>
    );
  }

  // 2. Render tin nhắn nhật ký cuộc gọi
  const isVideo = meta.callType === 'VIDEO';
  const isMissed = meta.status === 'MISSED' || meta.status === 'NO_ANSWER';
  const iconName = isVideo
    ? isMissed ? 'videocam-off' : 'videocam'
    : 'call';

  // Xác định màu chủ đạo cho logic cuộc gọi (lỗi/nhỡ -> màu error, bình thường -> màu text mặc định)
  const itemColor = isMissed ? theme.colors.error : theme.colors.onSurfaceVariant;

  return (
    <View style={styles.container}>
      <View style={[styles.callPill, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Ionicons
          name={iconName as any}
          size={14}
          color={itemColor}
        />
        <Text style={[styles.callText, { color: itemColor }, isMissed && styles.callTextMissed]}>
          {getCallLogLabel(meta)}
        </Text>
      </View>
    </View>
  );
}

// Giữ StyleSheet gọn gàng, chỉ chứa các thuộc tính về Layout và Typography
const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
    marginVertical: 4,
  },
  genericPill: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  genericText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  callPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  callText: {
    fontSize: 13,
  },
  callTextMissed: {
    fontWeight: '500', // Giữ lại độ đậm cho cuộc gọi nhỡ để tăng tính chú ý
  },
});