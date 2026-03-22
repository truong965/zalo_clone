import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { Message, MessageType } from '@/types/message';
import { getFullUrl, getReplyPreviewText } from './message-item.utils';
import { styles } from './message-item.styles';
import { MessageImageAttachment }    from './attachments/message-image-attachment';
import { MessageVideoAttachment }    from './attachments/message-video-attachment';
import { MessageAudioAttachment }    from './attachments/message-audio-attachment';
import { MessageDocumentAttachment } from './attachments/message-document-attachment';

interface Props {
  message: Message;
  isMe: boolean;
  theme: any;
  onJumpToMessage?: (messageId: string) => void;
  isHighlighted?: boolean;
}

export function MessageContent({ message, isMe, theme, onJumpToMessage, isHighlighted }: Props) {
  const attachments = message.mediaAttachments || [];

  if (attachments.length === 0 && !message.parentMessage && !message.replyTo) {
    if (message.type === MessageType.TEXT) {
      return (
        <Text style={styles.messageText}>
          {message.content}
        </Text>
      );
    }
    // For non-text messages with no attachments yet (and not a reply)
    return (
      <Text style={[styles.messageText, { fontStyle: 'italic', color: '#9ca3af' }]}>
        Đang tải...
      </Text>
    );
  }

  const images    = attachments.filter(a => a.mediaType === 'IMAGE');
  const videos    = attachments.filter(a => a.mediaType === 'VIDEO');
  const audios    = attachments.filter(a => a.mediaType === 'AUDIO');
  const documents = attachments.filter(a => a.mediaType === 'DOCUMENT');

  return (
    <View style={{ flexDirection: 'column', gap: 4 }}>
      {/* Reply preview */}
      {(message.parentMessage || message.replyTo) && (() => {
        const replyMsg = message.parentMessage || message.replyTo;
        const isDeleted = !!replyMsg.deletedAt;

        return (
          <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.replyContainer, { borderLeftColor: isMe ? '#0091ff' : theme.colors.primary }]}
            onPress={() => {
              const replyMsg = message.parentMessage || message.replyTo;
              if (replyMsg?.id) onJumpToMessage?.(replyMsg.id.toString());
            }}
          >
            <Text 
              style={[styles.replySender, isDeleted && { color: '#9ca3af' }]} 
              numberOfLines={1}
            >
              {replyMsg.sender?.displayName || 'Người dùng'}
            </Text>
            <Text 
              style={[styles.replyContent, isDeleted && { fontStyle: 'italic', color: '#9ca3af' }]} 
              numberOfLines={1}
            >
              {getReplyPreviewText(replyMsg)}
            </Text>
          </TouchableOpacity>
        );
      })()}

      {/* Text caption */}
      {!!message.content && (
        <Text style={[styles.messageText, { marginBottom: 4 }]}>{message.content}</Text>
      )}

      {/* Images */}
      {images.length > 0 && (
        images.length === 1 ? (
          <MessageImageAttachment attachment={images[0]} isSingle />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: 220 }}>
            {images.map(img => <MessageImageAttachment key={img.id} attachment={img} isSingle={false} />)}
          </View>
        )
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <View style={{ gap: 4 }}>
          {videos.map(vid => <MessageVideoAttachment key={vid.id} attachment={vid} />)}
        </View>
      )}

      {/* Audios */}
      {audios.length > 0 && (
        <View style={{ gap: 4 }}>
          {audios.map(aud => (
            <MessageAudioAttachment key={aud.id} attachment={aud} isMe={isMe} theme={theme} />
          ))}
        </View>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <View style={{ gap: 4 }}>
          {documents.map(doc => (
            <MessageDocumentAttachment key={doc.id} attachment={doc} isMe={isMe} theme={theme} />
          ))}
        </View>
      )}
    </View>
  );
}
