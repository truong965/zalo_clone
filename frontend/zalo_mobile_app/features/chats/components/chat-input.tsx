import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import EmojiPicker from 'rn-emoji-keyboard';
import { MessageType } from '@/types/message';
import { Friend } from '@/types/friendship';
import { useAudioRecorder } from '../hooks/use-audio-recorder';
import { useFriendsList } from '../hooks/use-conversation-queries';
import { useMobileMediaUpload } from '../hooks/use-mobile-media-upload';
import { useReminders } from '../hooks/use-reminders';
import { useVoiceDictation } from '../hooks/use-voice-dictation';
import { useChatStore } from '../stores/chat.store';
import { getReplyIconName, getReplyPreviewText } from './message-item/message-item.utils';
import { CreateReminderModal } from './reminder/create-reminder-modal';
import { VoiceRecordingUI } from './voice-recording-ui';

interface ChatInputProps {
  onSend: (
    content: string,
    type?: MessageType,
    mediaIds?: string[],
    replyTarget?: any,
    localAssets?: any[],
  ) => void;
  conversationId?: string;
}

type QuickMessageMap = Record<string, string>;

const QUICK_MESSAGE_STORAGE_KEY = 'chat.quickMessages';
const DEFAULT_QUICK_MESSAGES: QuickMessageMap = {
  '/hello': 'xin chao minh co the giup gi cho ban',
};

const getFriendPhoneNumber = (friend: Friend): string => {
  const candidate =
    (friend as any).phoneNumber ??
    (friend as any).phone ??
    (friend as any).phoneNum ??
    '';
  return typeof candidate === 'string' ? candidate.trim() : '';
};

export function ChatInput({ onSend, conversationId }: ChatInputProps) {
  const [content, setContent] = useState('');
  const [voiceSendMode, setVoiceSendMode] = useState<'record' | 'stt'>('record');
  const [isVoicePanelOpen, setIsVoicePanelOpen] = useState(false);
  const [showExtraOptions, setShowExtraOptions] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showNamecardModal, setShowNamecardModal] = useState(false);
  const [namecardSearch, setNamecardSearch] = useState('');
  const [showQuickMessageModal, setShowQuickMessageModal] = useState(false);
  const [quickMessages, setQuickMessages] = useState<QuickMessageMap>(DEFAULT_QUICK_MESSAGES);
  const [quickKeywordInput, setQuickKeywordInput] = useState('/hello');
  const [quickValueInput, setQuickValueInput] = useState(DEFAULT_QUICK_MESSAGES['/hello']);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { pickMedia, pickDocuments, isUploading } = useMobileMediaUpload();
  const {
    isRecording,
    isUploadingAudio,
    recordingDuration,
    recordingUri,
    metering,
    startRecording,
    cancelRecording,
    preparePreview,
    stopAndSend,
  } = useAudioRecorder();
  const {
    isListening,
    start: startDictation,
    stop: stopDictation,
    cancel: cancelDictation,
  } = useVoiceDictation();
  const { createReminder } = useReminders(conversationId);
  const { replyTarget, clearReplyTarget } = useChatStore();
  const friendsQuery = useFriendsList({
    search: namecardSearch.trim() || undefined,
    enabled: showNamecardModal,
    conversationId,
  });

  const androidBaseBottomInset = Math.max(insets.bottom, 2);
  const androidKeyboardOffset =
    Platform.OS === 'android' && keyboardInset > 0 ? keyboardInset + 6 : 0;
  const voicePanelBottomInset =
    Platform.OS === 'ios'
      ? Math.max(insets.bottom, 8)
      : androidBaseBottomInset + androidKeyboardOffset + 20;
  const isVoiceModeActive = isVoicePanelOpen || isRecording || isUploadingAudio || !!recordingUri;
  const shouldHideInputForVoiceTimeline =
    isVoiceModeActive && (isRecording || isUploadingAudio || !!recordingUri);
  const voicePanelBaseHeight = keyboardInset > 0 ? keyboardInset : Platform.OS === 'ios' ? 320 : 300;
  const voicePanelHeight = voicePanelBaseHeight + voicePanelBottomInset;

  React.useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardInset(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  React.useEffect(() => {
    const loadQuickMessages = async () => {
      try {
        const raw = await AsyncStorage.getItem(QUICK_MESSAGE_STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw) as QuickMessageMap;
        if (!parsed || typeof parsed !== 'object') return;

        const cleaned = Object.entries(parsed).reduce<QuickMessageMap>((acc, [k, v]) => {
          if (typeof k === 'string' && typeof v === 'string' && k.trim().startsWith('/') && v.trim()) {
            acc[k.trim().toLowerCase()] = v.trim();
          }
          return acc;
        }, {});

        if (Object.keys(cleaned).length > 0) {
          setQuickMessages(cleaned);
        }
      } catch (error) {
        console.warn('Failed to load quick messages', error);
      }
    };

    void loadQuickMessages();
  }, []);

  const persistQuickMessages = async (nextMap: QuickMessageMap) => {
    setQuickMessages(nextMap);
    await AsyncStorage.setItem(QUICK_MESSAGE_STORAGE_KEY, JSON.stringify(nextMap));
  };

  const handleSend = () => {
    if (!content.trim()) return;

    const raw = content.trim();
    const mappedText = quickMessages[raw.toLowerCase()];
    const finalText = mappedText || raw;
    onSend(finalText, MessageType.TEXT, undefined, replyTarget ?? undefined);
    setContent('');
    setShowExtraOptions(false);
    clearReplyTarget();
  };

  const handleMediaUpload = async () => {
    try {
      const assets = await pickMedia();
      if (!assets || assets.length === 0) return;

      const images = assets.filter((a) => a.type === 'image');
      const videos = assets.filter((a) => a.type === 'video');

      if (images.length > 0) {
        onSend('', MessageType.IMAGE, undefined, replyTarget ?? undefined, images);
      }

      for (const video of videos) {
        onSend('', MessageType.VIDEO, undefined, replyTarget ?? undefined, [video]);
      }

      setShowExtraOptions(false);
      clearReplyTarget();
    } catch (error) {
      console.error('Failed to pick media:', error);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không thể chọn hình ảnh/video',
      });
    }
  };

  const handleDocumentUpload = async () => {
    try {
      const assets = await pickDocuments();
      if (!assets || assets.length === 0) return;

      onSend('', MessageType.FILE, undefined, replyTarget ?? undefined, assets);
      setShowExtraOptions(false);
      clearReplyTarget();
    } catch (error) {
      console.error('Failed to pick documents:', error);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không thể chọn tài liệu',
      });
    }
  };

  const handleCreateReminder = async (params: any) => {
    try {
      await createReminder(params);
      setShowExtraOptions(false);
    } catch (error) {
      console.error('Failed to create reminder:', error);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không thể tạo nhắc hẹn',
      });
    }
  };

  const handleOpenNamecardPicker = () => {
    setShowExtraOptions(false);
    setShowNamecardModal(true);
  };

  const handleSendNamecard = (friend: Friend) => {
    const displayName = friend.resolvedDisplayName || friend.displayName || 'Người dùng';
    const phone = getFriendPhoneNumber(friend);
    const avatarLine = friend.avatarUrl ? `\nAvatar: ${friend.avatarUrl}` : '';
    const phoneLine = phone ? `\nPhone: ${phone}` : '';
    const namecardContent = `[Namecard]\n${displayName}${phoneLine}\nUID: ${friend.userId}${avatarLine}`;
    onSend(namecardContent, MessageType.TEXT, undefined, replyTarget ?? undefined);
    clearReplyTarget();
    setShowNamecardModal(false);
    setNamecardSearch('');
  };

  const namecardFriends = friendsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const trimmedInput = content.trim();
  const quickMessageHints = React.useMemo(() => {
    if (!trimmedInput.startsWith('/')) return [];
    const searchTerm = trimmedInput.slice(1).trim();
    if (searchTerm.length < 2) return [];
    const needle = trimmedInput.toLowerCase();
    return Object.entries(quickMessages)
      .filter(([keyword, value]) => keyword.includes(needle) || value.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [trimmedInput, quickMessages]);

  const handleChooseQuickHint = (keyword: string, value: string) => {
    setContent(value);
    setShowExtraOptions(false);
    setQuickKeywordInput(keyword);
    setQuickValueInput(value);
  };

  const handleSaveQuickMessage = async () => {
    const keyword = quickKeywordInput.trim().toLowerCase();
    const value = quickValueInput.trim();

    if (!keyword.startsWith('/')) {
      Toast.show({
        type: 'error',
        text1: 'Keyword không hợp lệ',
        text2: 'Keyword phải bắt đầu bằng /',
      });
      return;
    }

    if (!value) {
      Toast.show({
        type: 'error',
        text1: 'Nội dung trống',
        text2: 'Vui lòng nhập nội dung cho quick message',
      });
      return;
    }

    try {
      const nextMap: QuickMessageMap = {
        ...quickMessages,
        [keyword]: value,
      };
      await persistQuickMessages(nextMap);
      Toast.show({
        type: 'success',
        text1: 'Đã lưu quick message',
        text2: `${keyword} -> ${value}`,
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không thể lưu quick message',
      });
    }
  };

  const handleDeleteQuickMessage = async (keyword: string) => {
    try {
      const nextMap = { ...quickMessages };
      delete nextMap[keyword];
      const safeMap = Object.keys(nextMap).length > 0 ? nextMap : DEFAULT_QUICK_MESSAGES;
      await persistQuickMessages(safeMap);
      Toast.show({
        type: 'success',
        text1: 'Đã xóa quick message',
        text2: keyword,
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không thể xóa quick message',
      });
    }
  };

  const handleShareCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Toast.show({
          type: 'error',
          text1: 'Không có quyền vị trí',
          text2: 'Vui lòng cấp quyền vị trí để chia sẻ',
        });
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = location.coords;
      const mapLink = `https://maps.google.com/?q=${latitude},${longitude}`;
      const locationText = `Vi tri hien tai cua toi:\n${latitude.toFixed(6)}, ${longitude.toFixed(6)}\n${mapLink}`;

      onSend(locationText, MessageType.TEXT, undefined, replyTarget ?? undefined);
      clearReplyTarget();
      setShowExtraOptions(false);
      Toast.show({
        type: 'success',
        text1: 'Đã chia sẻ vị trí',
      });
    } catch (error) {
      console.error('Failed to share location:', error);
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: 'Không thể lấy vị trí hiện tại',
      });
    }
  };

  const handleStopAndSendAudio = async () => {
    const mediaId = await stopAndSend();
    if (mediaId) {
      onSend('', MessageType.VOICE, [mediaId], replyTarget ?? undefined);
      setShowExtraOptions(false);
      clearReplyTarget();
      setIsVoicePanelOpen(false);
      Toast.show({
        type: 'info',
        text1: 'Đang gửi',
        text2: 'Tin nhắn thoại đang được xử lý',
      });
    } else {
      setIsVoicePanelOpen(false);
      Toast.show({
        type: 'error',
        text1: 'Gửi thất bại',
        text2: 'Không thể gửi tin nhắn thoại',
      });
    }
  };

  const handleOpenVoicePanel = () => {
    Keyboard.dismiss();
    setIsVoicePanelOpen(true);
  };

  const handleStartVoiceRecording = async () => {
    setIsVoicePanelOpen(true);
    await startRecording();
  };

  const handleCancelVoice = async () => {
    if (voiceSendMode === 'stt') {
      await cancelDictation();
      setIsVoicePanelOpen(true);
      return;
    }
    await cancelRecording();
    setIsVoicePanelOpen(true);
  };

  const handleFocusInput = () => {
    setShowExtraOptions(false);
    if (isVoiceModeActive) {
      setIsVoicePanelOpen(false);
      void cancelDictation();
      void cancelRecording();
    }
  };

  const handleDictationPress = async () => {
    if (voiceSendMode !== 'stt') return;

    if (!isListening) {
      const started = await startDictation();
      if (!started.ok) {
        const sttErrorText =
          started.reason === 'permission_denied'
            ? 'Hãy cấp quyền micro trong cài đặt Android'
            : started.reason === 'native_module_unavailable'
              ? 'Bản app hiện tại chưa có native STT, hãy rebuild Android dev client'
              : 'Không thể khởi động nhận diện giọng nói';
        Toast.show({
          type: 'error',
          text1: 'Không thể bật STT',
          text2: sttErrorText,
        });
      }
      return;
    }

    const transcript = await stopDictation();
    if (transcript) {
      setContent((prev) => `${prev}${prev.trim().length > 0 ? ' ' : ''}${transcript}`.trimStart());
      setIsVoicePanelOpen(false);
    }
  };

  const handlePickEmoji = (emojiObject: any) => {
    setContent((prev) => prev + emojiObject.emoji);
  };

  return (
    <View className="bg-card border-t border-border">
      {!shouldHideInputForVoiceTimeline && (
        <View
          style={{
            paddingBottom:
              Platform.OS === 'ios'
                ? Math.max(insets.bottom, 8)
                : androidBaseBottomInset + androidKeyboardOffset,
          }}
        >
          {replyTarget && (
            <View className="flex-row items-center px-4 py-2 bg-muted/30 border-b border-border/30 border-l-2 border-l-primary/60">
              <View className="mr-3 p-1">
                <Ionicons
                  name={getReplyIconName(replyTarget) as any}
                  size={20}
                  color={theme.colors.primary}
                />
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-primary" numberOfLines={1}>
                  Đang trả lời {replyTarget.senderName}
                </Text>
                <Text className="text-xs text-onSurfaceVariant" numberOfLines={1}>
                  {getReplyPreviewText(replyTarget)}
                </Text>
              </View>
              <TouchableOpacity onPress={clearReplyTarget} className="p-1">
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={theme.colors.onSurfaceVariant}
                />
              </TouchableOpacity>
            </View>
          )}

          <View className="flex-row items-center p-2 min-h-[56px]">
            <TouchableOpacity className="p-2" disabled={isUploading} onPress={() => setShowEmojiPicker(true)}>
              <Ionicons name="happy-outline" size={24} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>

            <View className="flex-1 mx-1 bg-muted rounded-2xl px-3 py-1 justify-center min-h-[40px]">
              <TextInput
                className="text-foreground text-base leading-5"
                placeholder="Tin nhắn"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                multiline
                value={content}
                onChangeText={(text) => {
                  setContent(text);
                  if (text.trim().length > 0) setShowExtraOptions(false);
                }}
                style={{ maxHeight: 100 }}
                editable={!isUploading}
                onFocus={handleFocusInput}
              />
            </View>

            {isUploading ? (
              <View className="p-2 ml-1">
                <ActivityIndicator size="small" color={theme.colors.primary} />
              </View>
            ) : content.trim().length > 0 ? (
              <TouchableOpacity onPress={handleSend} className="p-2 ml-1">
                <Ionicons name="send" size={24} color={theme.colors.primary} />
              </TouchableOpacity>
            ) : (
              <View className="flex-row items-center">
                <TouchableOpacity
                  className="p-2.5"
                  onPress={() => setShowExtraOptions(!showExtraOptions)}
                >
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={26}
                    color={showExtraOptions ? theme.colors.primary : theme.colors.onSurfaceVariant}
                  />
                </TouchableOpacity>
                <TouchableOpacity className="p-2.5" onPress={handleOpenVoicePanel}>
                  <Ionicons
                    name="mic-outline"
                    size={26}
                    color={isVoiceModeActive ? theme.colors.primary : theme.colors.onSurfaceVariant}
                  />
                </TouchableOpacity>
                <TouchableOpacity className="p-2.5" onPress={handleMediaUpload}>
                  <Ionicons name="image-outline" size={26} color={theme.colors.onSurfaceVariant} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {quickMessageHints.length > 0 && (
            <View className="px-2 pb-2">
              <View className="bg-muted border border-border/50 rounded-xl overflow-hidden">
                {quickMessageHints.map(([keyword, value], index) => (
                  <TouchableOpacity
                    key={keyword}
                    className={`px-3 py-2 ${index < quickMessageHints.length - 1 ? 'border-b border-border/40' : ''}`}
                    onPress={() => handleChooseQuickHint(keyword, value)}
                  >
                    <Text className="text-xs font-semibold text-primary">{keyword}</Text>
                    <Text className="text-sm text-foreground" numberOfLines={1}>
                      {value}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {showExtraOptions && (
            <View className="flex-row flex-wrap bg-muted border-t border-border/50 py-3">
              <TouchableOpacity className="items-center mb-2" style={{ width: '20%' }} onPress={handleDocumentUpload}>
                <View className="w-14 h-14 rounded-2xl bg-blue-100 items-center justify-center mb-1">
                  <Ionicons name="document-text-outline" size={30} color="#2563eb" />
                </View>
                <Text className="text-sm font-medium text-onSurfaceVariant text-center">Tài liệu</Text>
              </TouchableOpacity>

              <TouchableOpacity className="items-center mb-2" style={{ width: '20%' }} onPress={() => setShowReminderModal(true)}>
                <View className="w-14 h-14 rounded-2xl bg-orange-100 items-center justify-center mb-1">
                  <Ionicons name="alarm-outline" size={30} color="#ea580c" />
                </View>
                <Text className="text-sm font-medium text-onSurfaceVariant text-center">Nhắc hẹn</Text>
              </TouchableOpacity>

              <TouchableOpacity className="items-center mb-2" style={{ width: '20%' }} onPress={handleOpenNamecardPicker}>
                <View className="w-14 h-14 rounded-2xl bg-cyan-100 items-center justify-center mb-1">
                  <Ionicons name="person-circle-outline" size={30} color="#0891b2" />
                </View>
                <Text className="text-sm font-medium text-onSurfaceVariant text-center">Namecard</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="items-center mb-2"
                style={{ width: '20%' }}
                onPress={() => {
                  setShowExtraOptions(false);
                  setShowQuickMessageModal(true);
                }}
              >
                <View className="w-14 h-14 rounded-2xl bg-violet-100 items-center justify-center mb-1">
                  <Ionicons name="flash-outline" size={30} color="#7c3aed" />
                </View>
                <Text className="text-sm font-medium text-onSurfaceVariant text-center">Quick message</Text>
              </TouchableOpacity>

              <TouchableOpacity className="items-center mb-2" style={{ width: '20%' }} onPress={handleShareCurrentLocation}>
                <View className="w-14 h-14 rounded-2xl bg-emerald-100 items-center justify-center mb-1">
                  <Ionicons name="location-outline" size={30} color="#059669" />
                </View>
                <Text className="text-sm font-medium text-onSurfaceVariant text-center">Vị trí</Text>
              </TouchableOpacity>
            </View>
          )}

          <CreateReminderModal
            visible={showReminderModal}
            onDismiss={() => setShowReminderModal(false)}
            onSubmit={handleCreateReminder}
            conversationId={conversationId}
          />

          <EmojiPicker
            onEmojiSelected={handlePickEmoji}
            open={showEmojiPicker}
            onClose={() => setShowEmojiPicker(false)}
          />

          <Modal
            visible={showNamecardModal}
            animationType="slide"
            transparent
            onRequestClose={() => {
              setShowNamecardModal(false);
              setNamecardSearch('');
            }}
          >
            <View className="flex-1 bg-black/30 justify-end">
              <View className="bg-card rounded-t-3xl px-4 pt-4 pb-6 max-h-[80%]">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-base font-semibold text-foreground">Chọn bạn để gửi namecard</Text>
                  <TouchableOpacity
                    className="p-1"
                    onPress={() => {
                      setShowNamecardModal(false);
                      setNamecardSearch('');
                    }}
                  >
                    <Ionicons name="close" size={24} color={theme.colors.onSurfaceVariant} />
                  </TouchableOpacity>
                </View>

                <View className="bg-muted rounded-xl px-3 py-2 mb-3">
                  <TextInput
                    value={namecardSearch}
                    onChangeText={setNamecardSearch}
                    placeholder="Tìm bạn bè..."
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    className="text-foreground"
                  />
                </View>

                {friendsQuery.isLoading ? (
                  <View className="py-8 items-center">
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  </View>
                ) : (
                  <FlatList
                    data={namecardFriends}
                    keyExtractor={(item) => item.friendshipId}
                    renderItem={({ item }) => {
                      const displayName = item.resolvedDisplayName || item.displayName || 'Người dùng';
                      const phone = getFriendPhoneNumber(item);
                      return (
                        <TouchableOpacity
                          className="flex-row items-center py-3 border-b border-border/40"
                          onPress={() => handleSendNamecard(item)}
                        >
                          <View className="w-10 h-10 rounded-full bg-cyan-100 items-center justify-center mr-3">
                            <Ionicons name="person-outline" size={20} color="#0891b2" />
                          </View>
                          <View className="flex-1">
                            <Text className="text-base text-foreground font-medium" numberOfLines={1}>
                              {displayName}
                            </Text>
                            <Text className="text-xs text-onSurfaceVariant" numberOfLines={1}>
                              {phone || item.userId}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }}
                    onEndReachedThreshold={0.4}
                    onEndReached={() => {
                      if (friendsQuery.hasNextPage && !friendsQuery.isFetchingNextPage) {
                        friendsQuery.fetchNextPage();
                      }
                    }}
                    ListFooterComponent={
                      friendsQuery.isFetchingNextPage ? (
                        <View className="py-3">
                          <ActivityIndicator size="small" color={theme.colors.primary} />
                        </View>
                      ) : null
                    }
                    ListEmptyComponent={
                      <View className="py-8 items-center">
                        <Text className="text-onSurfaceVariant">
                          {namecardSearch.trim()
                            ? 'Không tìm thấy bạn bè phù hợp'
                            : 'Bạn chưa có bạn bè để gửi namecard'}
                        </Text>
                      </View>
                    }
                  />
                )}
              </View>
            </View>
          </Modal>

          <Modal
            visible={showQuickMessageModal}
            animationType="fade"
            transparent
            onRequestClose={() => setShowQuickMessageModal(false)}
          >
            <KeyboardAvoidingView
              className="flex-1"
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
            >
            <View className="flex-1 bg-black/30 justify-center px-4">
              <TouchableOpacity className="absolute inset-0" activeOpacity={1} onPress={() => setShowQuickMessageModal(false)} />
              <View className="bg-card rounded-3xl px-4 pt-4 pb-4 w-full self-center max-h-[78%]">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-base font-semibold text-foreground">Cai dat quick message</Text>
                  <TouchableOpacity className="p-1" onPress={() => setShowQuickMessageModal(false)}>
                    <Ionicons name="close" size={24} color={theme.colors.onSurfaceVariant} />
                  </TouchableOpacity>
                </View>
                <Text className="text-xs text-onSurfaceVariant mb-2">
                  Khi nhap dung /keyword va bam gui, app se thay bang noi dung tuong ung.
                </Text>
                <View className="bg-muted rounded-xl px-3 py-2 mb-2">
                  <TextInput
                    value={quickKeywordInput}
                    onChangeText={setQuickKeywordInput}
                    placeholder="/hello"
                    autoCapitalize="none"
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    className="text-foreground"
                  />
                </View>
                <View className="bg-muted rounded-xl px-3 py-2 mb-3">
                  <TextInput
                    value={quickValueInput}
                    onChangeText={setQuickValueInput}
                    placeholder="Noi dung quick message"
                    placeholderTextColor={theme.colors.onSurfaceVariant}
                    className="text-foreground"
                  />
                </View>
                <TouchableOpacity
                  className="bg-primary rounded-xl py-3 items-center mb-3"
                  onPress={handleSaveQuickMessage}
                >
                  <Text className="text-white font-semibold">Luu quick message</Text>
                </TouchableOpacity>
                <Text className="text-sm font-semibold text-foreground mb-2">Danh sach dang dung</Text>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'position' : undefined}
              >
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {Object.entries(quickMessages).map(([keyword, value]) => (
                    <TouchableOpacity
                      key={keyword}
                      className="py-3 border-b border-border/40"
                      onPress={() => {
                        setQuickKeywordInput(keyword);
                        setQuickValueInput(value);
                      }}
                    >
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 pr-3">
                          <Text className="text-sm font-semibold text-primary">{keyword}</Text>
                          <Text className="text-sm text-foreground">{value}</Text>
                        </View>
                        <TouchableOpacity className="p-1" onPress={() => handleDeleteQuickMessage(keyword)}>
                          <Ionicons name="trash-outline" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {Object.keys(quickMessages).length === 0 && (
                    <View className="py-6 items-center">
                      <Text className="text-onSurfaceVariant">Chua co quick message</Text>
                    </View>
                  )}
                </ScrollView>
              </KeyboardAvoidingView>
              </View>
            </View>
            </KeyboardAvoidingView>
          </Modal>
        </View>
      )}

      {isVoiceModeActive && (
        <View style={{ height: voicePanelHeight }}>
          <VoiceRecordingUI
            isRecording={isRecording}
            isUploadingAudio={isUploadingAudio}
            recordingDuration={recordingDuration}
            recordingUri={recordingUri}
            metering={metering}
            onCancel={handleCancelVoice}
            onSend={handleStopAndSendAudio}
            onPreview={preparePreview}
            onStartRecording={handleStartVoiceRecording}
            sendMode={voiceSendMode}
            onSendModeChange={setVoiceSendMode}
            isDictating={isListening}
            onDictatePress={handleDictationPress}
            bottomInset={voicePanelBottomInset}
          />
        </View>
      )}
    </View>
  );
}
