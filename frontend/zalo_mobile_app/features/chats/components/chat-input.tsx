import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, ActivityIndicator, Text } from 'react-native';
import { useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useMobileMediaUpload } from '../hooks/use-mobile-media-upload';
import { useAudioRecorder } from '../hooks/use-audio-recorder';
import { MessageType } from '@/types/message';

import { useReminders } from '../hooks/use-reminders';
import { CreateReminderModal } from './reminder/create-reminder-modal';
import { useChatStore } from '../stores/chat.store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getReplyIconName, getReplyPreviewText } from './message-item/message-item.utils';
import Toast from 'react-native-toast-message';
import { VoiceRecordingUI } from './voice-recording-ui';

interface ChatInputProps {
    onSend: (content: string, type?: MessageType, mediaIds?: string[], replyTarget?: any, localAssets?: any[]) => void;
    conversationId?: string;
}

export function ChatInput({ onSend, conversationId }: ChatInputProps) {
    const [content, setContent] = useState('');
    const [showExtraOptions, setShowExtraOptions] = useState(false);
    const [showReminderModal, setShowReminderModal] = useState(false);
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { pickMedia, pickDocuments, isUploading } = useMobileMediaUpload();
    const { isRecording, isUploadingAudio, recordingDuration, metering, startRecording, cancelRecording, stopAndSend } = useAudioRecorder();
    const { createReminder } = useReminders(conversationId);
    const { replyTarget, clearReplyTarget } = useChatStore();

    const handleSend = () => {
        if (content.trim()) {
            onSend(content.trim(), MessageType.TEXT, undefined, replyTarget ?? undefined);
            setContent('');
            setShowExtraOptions(false);
            clearReplyTarget();
        }
    };

    const handleMediaUpload = async () => {
        try {
            const assets = await pickMedia();
            if (assets && assets.length > 0) {
                // Send immediately with local assets for optimistic UI
                onSend('', MessageType.IMAGE, undefined, replyTarget ?? undefined, assets);
                setShowExtraOptions(false);
                clearReplyTarget();
            }
        } catch (error) {
            console.error("Failed to pick media:", error);
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
            if (assets && assets.length > 0) {
                // Send immediately with local assets for optimistic UI
                onSend('', MessageType.FILE, undefined, replyTarget ?? undefined, assets);
                setShowExtraOptions(false);
                clearReplyTarget();
            }
        } catch (error) {
            console.error("Failed to pick documents:", error);
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
            console.error("Failed to create reminder:", error);
            Toast.show({
                type: 'error',
                text1: 'Lỗi',
                text2: 'Không thể tạo nhắc hẹn',
            });
        }
    };

    const handleStopAndSendAudio = async () => {
        const mediaId = await stopAndSend();
        if (mediaId) {
            onSend('', MessageType.VOICE, [mediaId], replyTarget ?? undefined);
            setShowExtraOptions(false);
            clearReplyTarget();
        }
    };

    if (isRecording || isUploadingAudio) {
        return (
            <VoiceRecordingUI
                isUploadingAudio={isUploadingAudio}
                recordingDuration={recordingDuration}
                metering={metering}
                onCancel={cancelRecording}
                onSend={handleStopAndSendAudio}
                bottomInset={insets.bottom}
            />
        );
    }

    return (
        <View className="bg-card border-t border-border" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
            {replyTarget && (
                <View className="flex-row items-center px-4 py-2 bg-muted/30 border-b border-border/30 border-l-2 border-l-primary/60">
                    <View className="mr-3 p-1">
                        <Ionicons name={getReplyIconName(replyTarget) as any} size={20} color={theme.colors.primary} />
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
                        <Ionicons name="close-circle" size={20} color={theme.colors.onSurfaceVariant} />
                    </TouchableOpacity>
                </View>
            )}
            <View className="flex-row items-center p-2 min-h-[56px]">
                <TouchableOpacity className="p-2" disabled={isUploading}>
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
                        onFocus={() => setShowExtraOptions(false)}
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
                        <TouchableOpacity className="p-2" onPress={() => setShowExtraOptions(!showExtraOptions)}>
                            <Ionicons name="ellipsis-horizontal" size={24} color={showExtraOptions ? theme.colors.primary : theme.colors.onSurfaceVariant} />
                        </TouchableOpacity>
                        <TouchableOpacity className="p-2" onPress={startRecording}>
                            <Ionicons name="mic-outline" size={24} color={theme.colors.onSurfaceVariant} />
                        </TouchableOpacity>
                        <TouchableOpacity className="p-2" onPress={handleMediaUpload}>
                            <Ionicons name="image-outline" size={24} color={theme.colors.onSurfaceVariant} />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {showExtraOptions && (
                <View className="flex-row items-center px-4 py-4 border-t border-border/50">
                    <TouchableOpacity className="items-center mr-8" onPress={handleDocumentUpload}>
                        <View className="w-14 h-14 rounded-2xl bg-blue-100 items-center justify-center mb-1">
                            <Ionicons name="document-text-outline" size={30} color="#2563eb" />
                        </View>
                        <Text className="text-sm font-medium text-onSurfaceVariant">Tài liệu</Text>
                    </TouchableOpacity>

                    <TouchableOpacity className="items-center" onPress={() => setShowReminderModal(true)}>
                        <View className="w-14 h-14 rounded-2xl bg-orange-100 items-center justify-center mb-1">
                            <Ionicons name="alarm-outline" size={30} color="#ea580c" />
                        </View>
                        <Text className="text-sm font-medium text-onSurfaceVariant">Nhắc hẹn</Text>
                    </TouchableOpacity>
                </View>
            )}

            <CreateReminderModal
                visible={showReminderModal}
                onDismiss={() => setShowReminderModal(false)}
                onSubmit={handleCreateReminder}
                conversationId={conversationId}
            />
        </View>
    );
}
