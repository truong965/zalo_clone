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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Tạo bình chọn</Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.label}>Câu hỏi</Text>
            <TextInput
              style={styles.input}
              multiline
              placeholder="Nhập câu hỏi"
              value={question}
              onChangeText={setQuestion}
              maxLength={500}
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Phương án</Text>
            {options.map((opt, index) => (
              <View key={index} style={styles.optionRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder={`Phương án ${index + 1}`}
                  value={opt}
                  onChangeText={(text) => {
                    const next = [...options];
                    next[index] = text;
                    setOptions(next);
                  }}
                  maxLength={200}
                />
                {options.length > MIN_OPTIONS && (
                  <TouchableOpacity onPress={() => setOptions(options.filter((_, i) => i !== index))}>
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
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Chọn nhiều phương án</Text>
              <Switch value={isMultipleChoices} onValueChange={setIsMultipleChoices} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Có thể thêm phương án mới</Text>
              <Switch value={allowAddOptions} onValueChange={setAllowAddOptions} />
            </View>
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={() => void handleSubmit()}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>Tạo</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    padding: 16,
  },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  scroll: { maxHeight: 400 },
  label: { fontSize: 13, color: '#666', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  addBtnText: { color: '#0068ff', fontSize: 14 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  switchLabel: { fontSize: 14, color: '#374151' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  cancelBtn: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  submitBtn: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#0068ff',
  },
  submitText: { color: '#fff', fontWeight: '600' },
});
