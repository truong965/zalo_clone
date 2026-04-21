import React from 'react';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useTranslationStore } from '@/hooks/use-translation-store';
import { Message, MessageType } from '@/types/message';
import { getFullUrl, getReplyPreviewText } from './message-item.utils';
import { styles } from './message-item.styles';
import { MessageImageAttachment } from './attachments/message-image-attachment';
import { MessageVideoAttachment } from './attachments/message-video-attachment';
import { MessageAudioAttachment } from './attachments/message-audio-attachment';
import { MessageDocumentAttachment } from './attachments/message-document-attachment';
import { MessageLinkPreview } from './message-link-preview';

interface Props {
  message: Message;
  isMe: boolean;
  theme: any;
  onJumpToMessage?: (messageId: string) => void;
  onMediaPress?: (mediaId: string) => void;
  isHighlighted?: boolean;
  translations?: Record<string, string>;
  isTranslationHidden?: (messageId: string, lang: string) => boolean;
  pendingLangs?: string[];
}

export function MessageContent({
  message,
  isMe,
  theme,
  onJumpToMessage,
  onMediaPress,
  isHighlighted,
  translations = {},
  isTranslationHidden = () => false,
  pendingLangs = [],
}: Props) {
  const {
    hideTranslation,
    showTranslation,
    clearTranslations
  } = useTranslationStore();

  const msgId = String(message.id);
  const recalled = Boolean(
    message.metadata &&
    typeof message.metadata === 'object' &&
    (message.metadata as Record<string, unknown>).recalled === true,
  );
  const isForwarded = Boolean(
    message.metadata &&
    typeof message.metadata === 'object' &&
    (message.metadata as Record<string, unknown>).forward &&
    typeof (message.metadata as Record<string, unknown>).forward === 'object',
  );
  const attachments = message.mediaAttachments || [];
  const firstUrl = extractFirstUrl(message.content || '');

  const isPendingNonText = attachments.length === 0 && !message.parentMessage && !message.replyTo && message.type !== MessageType.TEXT;

  const images = attachments.filter(a => a.mediaType === 'IMAGE');
  const videos = attachments.filter(a => a.mediaType === 'VIDEO');
  const audios = attachments.filter(
    (a) => a.mediaType === 'AUDIO' || (message.type === MessageType.VOICE && a.mediaType === 'DOCUMENT'),
  );
  const documents = attachments.filter(
    (a) => a.mediaType === 'DOCUMENT' && !(message.type === MessageType.VOICE),
  );

  if (recalled) {
    return (
      <View style={{ flexDirection: 'column', gap: 4 }}>
        <Text style={[styles.messageText, { fontStyle: 'italic', color: '#9ca3af' }]}>
          Tin nhắn đã được thu hồi
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'column', gap: 4 }}>
      {isForwarded && (
        <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>
          Đã chuyển tiếp
        </Text>
      )}

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

      {/* Text caption or body */}
      {!!message.content && (
        <Text style={[styles.messageText, (attachments.length > 0 || message.parentMessage || message.replyTo || Object.keys(translations).length > 0 || firstUrl) && { marginBottom: 4 }]}>
          {message.content}
        </Text>
      )}
      {firstUrl && <MessageLinkPreview url={firstUrl} theme={theme} />}

      {/* Pending status for non-text without attachments */}
      {isPendingNonText && (
        <Text style={[styles.messageText, { fontStyle: 'italic', color: '#9ca3af', marginBottom: 4 }]}>
          Đang tải...
        </Text>
      )}

      {/* Translations */}
      {Object.entries(translations).map(([lang, text]) => {
        const isHidden = isTranslationHidden?.(msgId, lang);
        const langLabel = lang === 'vi' ? 'Tiếng Việt' : lang === 'en' ? 'Tiếng Anh' : lang;

        return (
          <View key={lang} style={localStyles.translationContainer}>
            {/* Header with actions */}
            <View style={localStyles.translationHeader}>
              <Text style={localStyles.langLabel}>{langLabel}</Text>

              <View style={localStyles.actionGroup}>
                <TouchableOpacity
                  onPress={() => isHidden ? showTranslation(msgId, lang) : hideTranslation(msgId, lang)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={isHidden ? 'eye-outline' : 'eye-off-outline'}
                    size={16}
                    color="#9ca3af"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => clearTranslations()} // GLOBAL CLEAR as requested
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Translated Content */}
            {!isHidden ? (
              <Text style={[styles.messageText, localStyles.translatedText]}>
                {text}
              </Text>
            ) : (
              <Text style={localStyles.hiddenPlaceholder}>
                Bản dịch đã ẩn
              </Text>
            )}
          </View>
        );
      })}

      {/* Pending Translations */}
      {pendingLangs.map((lang) => {
        const langLabel = lang === 'vi' ? 'Tiếng Việt' : lang === 'en' ? 'Tiếng Anh' : lang;
        return (
          <View key={`pending-${lang}`} style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ActivityIndicator size={12} color="#007AFF" />
            <Text style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>
              Đang dịch {langLabel}...
            </Text>
          </View>
        );
      })}

      {/* Images */}
      {images.length > 0 && (
        <View style={{ overflow: 'hidden', marginTop: 4 }}>
          {images.length === 1 && (
            <TouchableOpacity onPress={() => onMediaPress?.(images[0].id.toString())} activeOpacity={0.9} style={{ width: 240, height: 240 }}>
              <MessageImageAttachment attachment={images[0]} />
            </TouchableOpacity>
          )}
          {images.length === 2 && (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {images.map(img => (
                <TouchableOpacity key={img.id} onPress={() => onMediaPress?.(img.id.toString())} activeOpacity={0.9} style={{ width: 118, height: 240 }}>
                  <MessageImageAttachment attachment={img} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {images.length === 3 && (
            <View style={{ gap: 4 }}>
              <TouchableOpacity onPress={() => onMediaPress?.(images[0].id.toString())} activeOpacity={0.9} style={{ width: 240, height: 140 }}>
                <MessageImageAttachment attachment={images[0]} />
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {images.slice(1).map(img => (
                  <TouchableOpacity key={img.id} onPress={() => onMediaPress?.(img.id.toString())} activeOpacity={0.9} style={{ width: 118, height: 118 }}>
                    <MessageImageAttachment attachment={img} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          {images.length === 4 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 4, rowGap: 4 }}>
              {images.map(img => (
                <TouchableOpacity key={img.id} onPress={() => onMediaPress?.(img.id.toString())} activeOpacity={0.9} style={{ width: 118, height: 118 }}>
                  <MessageImageAttachment attachment={img} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {images.length >= 5 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 242, gap: 4, rowGap: 4 }}>
              {images.slice(0, 6).map((img, index) => (
                <TouchableOpacity key={img.id} onPress={() => onMediaPress?.(img.id.toString())} activeOpacity={0.9} style={{ width: 78, height: 78 }}>
                  <MessageImageAttachment attachment={img} />
                  {index === 5 && images.length > 6 && (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', borderRadius: 12 }}>
                       <Text style={{ color: 'white', fontSize: 18, fontWeight: 'bold' }}>+{images.length - 6}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <View style={{ gap: 4 }}>
          {videos.map(vid => (
            <TouchableOpacity key={vid.id} onPress={() => onMediaPress?.(vid.id.toString())} activeOpacity={0.9}>
              <MessageVideoAttachment attachment={vid} />
            </TouchableOpacity>
          ))}
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

const localStyles = StyleSheet.create({
  translationContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  translationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  langLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  translatedText: {
    color: '#4b5563',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  hiddenPlaceholder: {
    fontSize: 13,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
});

function extractFirstUrl(content: string): string | null {
  if (!content) return null;
  const normalizedContent = content.replace(/\n/g, ' ');
  const withProtocolMatch = normalizedContent.match(/(https?:\/\/[^\s]+)/i);
  if (withProtocolMatch?.[1]) {
    return withProtocolMatch[1].trim().replace(/[),.!?]+$/, '');
  }

  const wwwMatch = normalizedContent.match(/(www\.[^\s]+)/i);
  if (wwwMatch?.[1]) {
    return `https://${wwwMatch[1].trim().replace(/[),.!?]+$/, '')}`;
  }

  // Fallback: plain domain like "google.com/abc" or "zalo.me"
  const plainDomainMatch = normalizedContent.match(
    /\b([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\/[^\s]*)?)/i,
  );
  if (!plainDomainMatch?.[1]) return null;
  const candidate = plainDomainMatch[1].trim().replace(/[),.!?]+$/, '');
  return `https://${candidate}`;
}
