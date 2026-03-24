import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { format } from 'date-fns';
import { Message } from '@/types/message';
import { UserAvatar } from '@/components/ui/user-avatar';
import { getFullUrl, getSendStatus, getReceiptDisplayState } from './message-item.utils';
import { styles } from './message-item.styles';
import { MessageContent } from './message-content';

export interface MessageItemProps {
  message: Message;
  isMe: boolean;
  isDirect: boolean;
  isLatestMyMessage: boolean;
  showAvatar?: boolean;
  showSenderName?: boolean;
  showTime?: boolean;
  onLongPress?: (message: Message) => void;
  onJumpToMessage?: (messageId: string) => void;
  onMediaPress?: (mediaId: string) => void;
  isHighlighted?: boolean;
}

export function MessageItem({
  message,
  isMe,
  isDirect,
  isLatestMyMessage,
  showSenderName,
  showTime = false,
  onLongPress,
  onJumpToMessage,
  onMediaPress,
  isHighlighted,
}: MessageItemProps) {
  const theme = useTheme();

  if (!message || typeof message !== 'object') return null;

  const time       = format(new Date(message.createdAt), 'HH:mm');
  const sender     = message?.sender;
  const senderName = sender?.displayName || 'Người dùng';

  return (
    <View style={[styles.row, isMe ? styles.rowMe : styles.rowOther]}>
      {/* Avatar (other users only) */}
      {!isMe && (
        <View style={styles.avatarWrapper}>
          <UserAvatar uri={getFullUrl(sender?.avatarUrl)} size={36} />
        </View>
      )}

      <View style={styles.bubbleColumn}>
        {/* Sender name */}
        {!isMe && showSenderName && sender && (
          <Text style={styles.senderName}>{senderName}</Text>
        )}

        {/* Bubble */}
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={() => onLongPress?.(message)}
          style={[
            styles.bubble,
            isMe ? styles.bubbleMe        : styles.bubbleOther,
            isMe ? styles.bubbleCornerMe  : styles.bubbleCornerOther,
            isHighlighted && styles.highlighted,
          ]}
        >
          <MessageContent 
            message={message} 
            isMe={isMe} 
            theme={theme} 
            onJumpToMessage={onJumpToMessage}
            onMediaPress={onMediaPress}
            isHighlighted={isHighlighted}
          />
        </TouchableOpacity>

        {/* Timestamp + send status */}
        {showTime && (
          <View style={[styles.timeRow, isMe ? styles.timeRowMe : styles.timeRowOther]}>
            <Text style={styles.timeText}>{time}</Text>
            {isMe && isLatestMyMessage && (
              <SendStatusLabel message={message} isDirect={isDirect} />
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── SendStatusLabel (private, only used above) ──────────────────────────────

function SendStatusLabel({ message, isDirect }: { message: Message; isDirect: boolean }) {
  const sendStatus = getSendStatus(message.metadata);
  if (sendStatus === 'SENDING') return <Text style={styles.statusText}>Đang gửi...</Text>;
  if (sendStatus === 'FAILED')  return <Text style={styles.statusError}>Lỗi mạng</Text>;

  const state = getReceiptDisplayState(message, isDirect);
  if (state === 'none')      return null;
  if (state === 'sent')      return <Text style={styles.statusText}>Đã gửi</Text>;
  if (state === 'delivered') return <Text style={styles.statusText}>Đã nhận</Text>;
  if (state === 'seen')      return <Text style={styles.statusSeen}>Đã xem</Text>;
  return null;
}
