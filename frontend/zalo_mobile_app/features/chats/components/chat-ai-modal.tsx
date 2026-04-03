import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal as RNModal,
  StatusBar,
  TextInput,
  Keyboard,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAiChat } from '../hooks/use-ai-chat';
import { useAiStore } from '../stores/ai.store';
import { AiMessageBubble, parseAiResponse } from './ai-message-bubble';

interface ChatAiModalProps {
  conversationId: string;
  visible: boolean;
  onClose: () => void;
}

export function ChatAiModal({ conversationId, visible, onClose }: ChatAiModalProps) {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const [inputValue, setInputValue] = useState('');

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const keyboardVerticalOffset = Platform.OS === 'ios' ? insets.top : 0;

  const { sendMessage, clearHistory } = useAiChat(conversationId);
  const conversationState = useAiStore((state) => state.aiConversations[conversationId] ?? null);
  const messages = conversationState?.messages ?? [];
  const activeRequestId = conversationState?.activeRequestId ?? null;
  const activeRequest = activeRequestId
    ? conversationState?.requests[activeRequestId] ?? null
    : null;
  const isLoading = Boolean(activeRequest && activeRequest.status !== 'completed' && activeRequest.status !== 'error');
  const streamingContent = activeRequest?.content ?? '';
  const progress = activeRequest?.progress;

  const aiSummaryStartMessageId = useAiStore((s) => s.aiSummaryStartMessageId);
  const setAiSummaryStartMessageId = useAiStore((s) => s.setAiSummaryStartMessageId);
  const lastProcessedIdRef = useRef<string | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollViewRef.current) {
      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages, activeRequestId, streamingContent]);

  useEffect(() => {
    lastProcessedIdRef.current = null;
  }, [visible]);

  // Handle summary request from message menu
  useEffect(() => {
    if (!aiSummaryStartMessageId) {
      lastProcessedIdRef.current = null;
      return;
    }

    if (lastProcessedIdRef.current === aiSummaryStartMessageId) return;
    lastProcessedIdRef.current = aiSummaryStartMessageId;

    const startId = aiSummaryStartMessageId;
    setAiSummaryStartMessageId(null);
    void sendMessage('Tóm tắt cho tôi từ tin nhắn được đánh dấu.', 'summary', startId);
  }, [aiSummaryStartMessageId, sendMessage, setAiSummaryStartMessageId]);

  const handleSend = useCallback(
    async (text?: string, type: 'ask' | 'summary' | 'agent' = 'agent') => {
      const messageText = (text ?? inputValue).trim();
      if (!messageText || isLoading) return;

      if (!text) setInputValue('');
      await sendMessage(messageText, type);
    },
    [inputValue, isLoading, sendMessage]
  );

  const handleClearHistory = async () => {
    if (messages.length === 0 && !activeRequestId) return;

    Alert.alert(
      'Xóa lịch sử AI?',
      'Bạn có chắc chắn muốn xóa toàn bộ lịch sử hội thoại AI? Hành động này không thể hoàn tác.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          onPress: async () => {
            try {
              const sessionId = conversationState?.sessionId;
              if (sessionId) {
                await clearHistory(sessionId);
              }
            } catch (error) {
              Alert.alert('Lỗi', 'Không thể xóa lịch sử');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const assistantProgressText = progress
    ? [progress.message, progress.percent != null ? `${progress.percent}%` : null]
      .filter(Boolean)
      .join(' • ')
    : '';

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[
            styles.contentContainer,
            { paddingTop: insets.top },
          ]}
          // FIX: Offset đúng để KAV tính toán chính xác trong modal statusBarTranslucent
          keyboardVerticalOffset={keyboardVerticalOffset}
        >
          {/* Header */}
          <View style={[styles.header, { backgroundColor: 'hsl(217.2, 91.2%, 59.8%)' }]}>
            <View style={styles.headerContent}>
              <Text style={[styles.headerTitle, { color: '#fff' }]}>Trợ lý AI ✨</Text>
            </View>
            <View style={styles.headerActions}>
              {(messages.length > 0 || activeRequestId) && (
                <TouchableOpacity
                  onPress={handleClearHistory}
                  style={styles.headerBtn}
                >
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 && !isLoading && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>Chào bạn! Tôi là trợ lý AI </Text>
                <Text style={styles.emptyDesc}>
                  Tôi có thể giúp bạn tóm tắt tin nhắn, phân tích lịch sử nhóm hoặc thực hiện các tác vụ khác.
                </Text>
              </View>
            )}

            {assistantProgressText ? (
              <View style={styles.progressContainer}>
                <Text style={styles.progressText}>{assistantProgressText}</Text>
              </View>
            ) : null}

            {messages.map((msg) => {
              const isAssistant = msg.role === 'assistant';
              const time = dayjs(msg.createdAt).format('HH:mm');

              return (
                <View
                  key={msg.id}
                  style={[
                    styles.messageWrapper,
                    isAssistant ? styles.assistantWrapper : styles.userWrapper,
                  ]}
                >
                  <AiMessageBubble
                    content={msg.content}
                    isUser={!isAssistant}
                    time={time}
                    error={msg.status === 'error' ? { message: 'Có lỗi xảy ra' } : undefined}
                  />
                </View>
              );
            })}

            {isLoading && activeRequest && (
              <View style={styles.messageWrapper}>
                <AiMessageBubble
                  content={streamingContent || ''}
                  isUser={false}
                  isLoading={!streamingContent}
                />
              </View>
            )}
          </ScrollView>

          <View style={[
            styles.inputContainer,
            { paddingBottom: isKeyboardVisible ? 12 : Math.max(insets.bottom, 12) },
          ]}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Bạn cần hỗ trợ gì?"
                value={inputValue}
                onChangeText={setInputValue}
                multiline
                editable={!isLoading}
                placeholderTextColor="#9ca3af"
                cursorColor="hsl(217.2, 91.2%, 59.8%)"
              />
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  !inputValue.trim() || isLoading ? styles.sendBtnDisabled : { backgroundColor: 'hsl(217.2, 91.2%, 59.8%)' },
                ]}
                onPress={() => handleSend()}
                disabled={!inputValue.trim() || isLoading}
              >
                <Ionicons
                  name="send"
                  size={18}
                  color={!inputValue.trim() || isLoading ? '#d1d5db' : '#fff'}
                />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef2f7',
  },
  contentContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    padding: 8,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 12,
  },
  emptyContainer: {
    marginTop: 60,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  progressContainer: {
    marginHorizontal: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  progressText: {
    fontSize: 12,
    color: 'hsl(217.2, 91.2%, 59.8%)',
    fontWeight: '500',
  },
  messageWrapper: {
    marginVertical: 4,
  },
  userWrapper: {
    alignItems: 'flex-end',
  },
  assistantWrapper: {
    alignItems: 'flex-start',
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    paddingRight: 6,
    paddingLeft: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 16,
    backgroundColor: 'transparent',
    maxHeight: 120,
    paddingTop: 12,
    paddingBottom: 12,
    paddingRight: 8,
    color: '#1e293b',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    marginRight: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  sendBtnDisabled: {
    backgroundColor: '#f1f5f9',
    shadowOpacity: 0,
    elevation: 0,
  },
});