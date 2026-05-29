import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CreatePollParams } from '@/types/poll';

const MIN_OPTIONS = 2;

interface CreatePollModalProps {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  onSubmit: (params: CreatePollParams) => Promise<void>;
  isSubmitting?: boolean;
}

export function CreatePollModal({
  visible,
  onClose,
  conversationId,
  onSubmit,
  isSubmitting = false,
}: CreatePollModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [isMultipleChoices, setIsMultipleChoices] = useState(false);
  const [allowAddOptions, setAllowAddOptions] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setQuestion('');
    setOptions(['', '']);
    setIsMultipleChoices(false);
    setAllowAddOptions(false);
  }, [visible]);

  const handleSubmit = async () => {
    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!trimmedQuestion || trimmedOptions.length < MIN_OPTIONS) return;
    await onSubmit({
      conversationId,
      question: trimmedQuestion,
      options: trimmedOptions,
      isMultipleChoices,
      allowAddOptions,
    });
    onClose();
  };

  const canSubmit =
    !isSubmitting &&
    question.trim().length > 0 &&
    options.map((o) => o.trim()).filter(Boolean).length >= MIN_OPTIONS;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Tạo bình chọn</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Scrollable content */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Câu hỏi</Text>
            <TextInput
              style={styles.input}
              multiline
              placeholder="Nhập câu hỏi"
              placeholderTextColor="#9ca3af"
              value={question}
              onChangeText={setQuestion}
              maxLength={500}
              textAlignVertical="top"
              numberOfLines={3}
            />

            <Text style={[styles.label, { marginTop: 12 }]}>Phương án</Text>
            {options.map((opt, index) => (
              <View key={index} style={styles.optionRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder={`Phương án ${index + 1}`}
                  placeholderTextColor="#9ca3af"
                  value={opt}
                  onChangeText={(text) => {
                    const next = [...options];
                    next[index] = text;
                    setOptions(next);
                  }}
                  maxLength={200}
                  returnKeyType="next"
                />
                {options.length > MIN_OPTIONS && (
                  <TouchableOpacity
                    onPress={() => setOptions(options.filter((_, i) => i !== index))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="remove-circle-outline" size={24} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {options.length < 12 && (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => setOptions([...options, ''])}
              >
                <Ionicons name="add-circle-outline" size={20} color="#0068ff" />
                <Text style={styles.addBtnText}>Thêm phương án</Text>
              </TouchableOpacity>
            )}

            <View style={styles.divider} />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Chọn nhiều phương án</Text>
              <Switch value={isMultipleChoices} onValueChange={setIsMultipleChoices} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Có thể thêm phương án mới</Text>
              <Switch value={allowAddOptions} onValueChange={setAllowAddOptions} />
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={() => void handleSubmit()}
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>Tạo</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 8 : 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingBottom: 8 },
  label: { fontSize: 13, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 4,
  },
  addBtnText: { color: '#0068ff', fontSize: 14, fontWeight: '500' },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchLabel: { fontSize: 14, color: '#374151' },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingBottom: Platform.OS === 'android' ? 8 : 0,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cancelText: { color: '#6b7280', fontSize: 14, fontWeight: '500' },
  submitBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#0068ff',
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
