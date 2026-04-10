import React, { useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { format } from 'date-fns';
import { Message } from '@/types/message';
import { UserAvatar } from '@/components/ui/user-avatar';
import { getFullUrl, getSendStatus, getReceiptDisplayState } from './message-item.utils';
import { styles } from './message-item.styles';
import { MessageContent } from './message-content';
import { ActionSheetMenu, MenuOption } from '@/components/ui/action-sheet-menu';
import { useTranslate } from '@/hooks/use-translate';
import { useTranslationStore } from '@/hooks/use-translation-store';

export interface MessageItemProps {
  message: Message;
  isMe: boolean;
  isDirect: boolean;
  isLatestMyMessage: boolean;
  conversationId: string;
  isPinned?: boolean;
  showAvatar?: boolean;
  showSenderName?: boolean;
  showTime?: boolean;
  onLongPress?: (message: Message) => void;
  onJumpToMessage?: (messageId: string) => void;
  onMediaPress?: (mediaId: string) => void;
  onRetry?: (message: Message) => void;
  onPin?: (message: Message) => void;
  onUnpin?: (message: Message) => void;
  onRecall?: (message: Message) => void;
  onDeleteForMe?: (message: Message) => void;
  isHighlighted?: boolean;
}

export function MessageItem({
  message,
  isMe,
  isDirect,
  isLatestMyMessage,
  conversationId,
  isPinned = false,
  showSenderName,
  showTime = false,
  onLongPress,
  onJumpToMessage,
  onMediaPress,
  onRetry,
  onPin,
  onUnpin,
  onRecall,
  onDeleteForMe,
  isHighlighted,
}: MessageItemProps) {
  const theme = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);
  const { translate } = useTranslate();
  const {
    translations,
    pendingTranslations,
    getTranslation,
    isTranslationHidden,
    hideTranslation,
    showTranslation,
    removeTranslation,
    isTranslationPending,
  } = useTranslationStore();

  if (!message || typeof message !== 'object') return null;

  const time       = format(new Date(message.createdAt), 'HH:mm');
  const sender     = message?.sender;
  const senderName = sender?.displayName || 'Người dùng';

  // Build menu options for long press
  const msgId = String(message.id);
  const hasViTranslation = Boolean(translations[msgId]?.vi);
  const hasEnTranslation = Boolean(translations[msgId]?.en);
  const viPending = isTranslationPending(msgId, 'vi');
  const enPending = isTranslationPending(msgId, 'en');
  const viHidden = isTranslationHidden(msgId, 'vi');
  const enHidden = isTranslationHidden(msgId, 'en');
  const isRecalled = Boolean(
    message.metadata &&
      typeof message.metadata === 'object' &&
      (message.metadata as Record<string, unknown>).recalled === true,
  );

  const menuOptions: (MenuOption | { divider: boolean })[] = [
    {
      id: 'pin_toggle',
      label: isPinned ? 'Bỏ ghim tin nhắn' : 'Ghim tin nhắn',
      icon: isPinned ? 'bookmark' : 'bookmark-outline',
      color: '#007AFF',
      onPress: () => {
        if (isPinned) {
          onUnpin?.(message);
        } else {
          onPin?.(message);
        }
      },
      hidden: !onPin || !onUnpin,
    },
    {
      id: 'reply',
      label: 'Trả lời',
      icon: 'arrow-undo',
      color: '#007AFF',
      onPress: () => onLongPress?.(message),
    },
    {
      id: 'recall',
      label: isRecalled ? 'Đã thu hồi' : 'Thu hồi',
      icon: 'trash-outline',
      color: '#ef4444',
      onPress: () => onRecall?.(message),
      disabled: !isMe || isRecalled,
      hidden: !onRecall,
    },
    {
      id: 'delete_for_me',
      label: 'Xóa ở phía bạn',
      icon: 'trash',
      color: '#ef4444',
      onPress: () => onDeleteForMe?.(message),
      hidden: !onDeleteForMe,
    },
    {
      divider: true,
    },
    // Translate submenu
    {
      id: 'translate_vi',
      label: viPending
        ? 'Đang dịch sang Tiếng Việt...'
        : `${hasViTranslation ? '✓ ' : ''}Dịch sang Tiếng Việt`,
      icon: 'language',
      color: hasViTranslation ? '#34C759' : viPending ? '#9ca3af' : '#007AFF',
      onPress: () => {
        if (!hasViTranslation && !viPending) {
          translate(msgId, conversationId, 'vi', message.content || '');
        }
      },
      disabled: hasViTranslation || viPending,
    },
    {
      id: 'translate_en',
      label: enPending
        ? 'Đang dịch sang Tiếng Anh...'
        : `${hasEnTranslation ? '✓ ' : ''}Dịch sang Tiếng Anh`,
      icon: 'language',
      color: hasEnTranslation ? '#34C759' : enPending ? '#9ca3af' : '#007AFF',
      onPress: () => {
        if (!hasEnTranslation && !enPending) {
          translate(msgId, conversationId, 'en', message.content || '');
        }
      },
      disabled: hasEnTranslation || enPending,
    },
    ...(hasViTranslation || hasEnTranslation ? [{ divider: true } as const] : []),
  ];

  return (
    <>
      <ActionSheetMenu
        visible={menuVisible}
        options={menuOptions}
        onClose={() => setMenuVisible(false)}
      />
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
            onLongPress={() => setMenuVisible(true)}
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
              translations={translations[msgId] || {}}
              isTranslationHidden={isTranslationHidden}
              pendingLangs={pendingTranslations[msgId] || []}
            />
          </TouchableOpacity>

          {/* Timestamp + send status */}
          {showTime && (
            <View style={[styles.timeRow, isMe ? styles.timeRowMe : styles.timeRowOther]}>
              <Text style={styles.timeText}>{time}</Text>
              {isMe && isLatestMyMessage && (
                <SendStatusLabel message={message} isDirect={isDirect} onRetry={onRetry} />
              )}
            </View>
          )}
        </View>
      </View>
    </>
  );
}

// ─── SendStatusLabel (private, only used above) ──────────────────────────────

function SendStatusLabel({ 
  message, 
  isDirect, 
  onRetry 
}: { 
  message: Message; 
  isDirect: boolean;
  onRetry?: (message: Message) => void;
}) {
  const sendStatus = getSendStatus(message.metadata);
  if (sendStatus === 'SENDING') return <Text style={styles.statusText}>Đang gửi...</Text>;
  
  if (sendStatus === 'FAILED') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={styles.statusError}>Lỗi mạng</Text>
        <TouchableOpacity 
          style={styles.retryBtn} 
          onPress={() => onRetry?.(message)}
        >
          <Text style={styles.retryText}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const state = getReceiptDisplayState(message, isDirect);
  if (state === 'none')      return null;
  if (state === 'sent')      return <Text style={styles.statusText}>Đã gửi</Text>;
  if (state === 'delivered') return <Text style={styles.statusText}>Đã nhận</Text>;
  if (state === 'seen')      return <Text style={styles.statusSeen}>Đã xem</Text>;
  return null;
}
