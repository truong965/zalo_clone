import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Modal,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/providers/auth-provider';
import { mobileApi } from '@/services/api';
import type { Message } from '@/types/message';
import type { PollDetail } from '@/types/poll';

interface PollMessageCardProps {
  message: Message;
  onPollUpdated?: (messageId: string, poll: PollDetail) => void;
}

export function PollMessageCard({ message, onPollUpdated }: PollMessageCardProps) {
  const { accessToken, user } = useAuth();
  const [localPoll, setLocalPoll] = useState<PollDetail | null>(message.poll ?? null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [newOptionText, setNewOptionText] = useState('');
  const [detailVisible, setDetailVisible] = useState(false);
  const [addOptionVisible, setAddOptionVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const addInputRef = useRef<TextInput>(null);

  // Đóng modal sau khi keyboard đã hạ xuống hoàn toàn để tránh nhấp nháy
  const closeAddModal = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => {
      setAddOptionVisible(false);
      setNewOptionText('');
    }, Platform.OS === 'android' ? 120 : 50);
  }, []);

  useEffect(() => {
    if (message.poll) {
      setLocalPoll(message.poll);
      setPendingIds(message.poll.myVotedOptionIds);
    }
  }, [message.poll]);

  const showResults = useMemo(() => {
    if (!localPoll) return false;
    return (
      localPoll.isClosed ||
      localPoll.totalVoters > 0 ||
      localPoll.myVotedOptionIds.length > 0
    );
  }, [localPoll]);

  const applyPoll = useCallback(
    (updated: PollDetail) => {
      setLocalPoll(updated);
      setPendingIds(updated.myVotedOptionIds);
      onPollUpdated?.(message.id, updated);
    },
    [message.id, onPollUpdated],
  );

  const vote = async (params: { toggleOptionId?: string; optionIds?: string[] }) => {
    if (!accessToken || !localPoll) return;
    setLoading(true);
    try {
      const updated = await mobileApi.votePoll(localPoll.id, params, accessToken);
      applyPoll(updated);
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể cập nhật bình chọn' });
    } finally {
      setLoading(false);
    }
  };

  const handleOptionPress = async (optionId: string) => {
    if (!localPoll || localPoll.isClosed) return;
    if (localPoll.myVotedOptionIds.includes(optionId)) {
      await vote({ toggleOptionId: optionId });
      return;
    }
    if (!localPoll.isMultipleChoices) {
      setPendingIds([optionId]);
      return;
    }
    setPendingIds((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId],
    );
  };

  const handleSubmit = async () => {
    if (!localPoll || pendingIds.length === 0) return;
    await vote({ optionIds: pendingIds });
  };

  const handleAddOption = async () => {
    const text = newOptionText.trim();
    if (!accessToken || !localPoll || !text) return;
    setLoading(true);
    try {
      const updated = await mobileApi.addPollOption(localPoll.id, text, accessToken);
      closeAddModal();
      applyPoll(updated);
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể thêm phương án' });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    if (!accessToken || !localPoll) return;
    setLoading(true);
    try {
      const updated = await mobileApi.closePoll(localPoll.id, accessToken);
      applyPoll(updated);
    } catch {
      Toast.show({ type: 'error', text1: 'Không thể kết thúc bình chọn' });
    } finally {
      setLoading(false);
    }
  };

  if (!localPoll) {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>Đang tải bình chọn...</Text>
      </View>
    );
  }

  const canSubmit =
    !localPoll.isClosed &&
    pendingIds.length > 0 &&
    (localPoll.isMultipleChoices
      ? JSON.stringify([...pendingIds].sort()) !==
        JSON.stringify([...localPoll.myVotedOptionIds].sort())
      : pendingIds[0] !== localPoll.myVotedOptionIds[0]);

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.question}>{localPoll.question}</Text>
        <Text style={styles.subtitle}>
          {localPoll.isMultipleChoices ? 'Chọn nhiều phương án' : 'Chọn một phương án'}
          {localPoll.isClosed ? ' · Đã kết thúc' : ''}
        </Text>

        {localPoll.options.map((opt) => {
          const selected = localPoll.isClosed
            ? localPoll.myVotedOptionIds.includes(opt.id)
            : pendingIds.includes(opt.id);
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.option, selected && styles.optionSelected]}
              disabled={localPoll.isClosed}
              onPress={() => void handleOptionPress(opt.id)}
            >
              <View style={styles.optionHeader}>
                <Text style={styles.optionText}>{opt.text}</Text>
                {showResults && (
                  <Text style={styles.percent}>{opt.percent}%</Text>
                )}
              </View>
              {showResults && (
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${opt.percent}%` }]} />
                </View>
              )}
              {showResults && opt.voters.length > 0 && (
                <View style={styles.voters}>
                  {opt.voters.slice(0, 3).map((v) =>
                    v.avatarUrl ? (
                      <Image key={v.id} source={{ uri: v.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View key={v.id} style={[styles.avatar, styles.avatarPlaceholder]}>
                        <Ionicons name="person" size={12} color="#9ca3af" />
                      </View>
                    ),
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {localPoll.allowAddOptions && !localPoll.isClosed && (
          <TouchableOpacity
            style={styles.addOptionBtn}
            onPress={() => setAddOptionVisible(true)}
          >
            <Text style={styles.addOptionBtnText}>+ Thêm phương án</Text>
          </TouchableOpacity>
        )}

        <View style={styles.footer}>
          <TouchableOpacity onPress={() => setDetailVisible(true)}>
            <Text style={styles.link}>Xem chi tiết</Text>
          </TouchableOpacity>
          {!localPoll.isClosed && (
            <TouchableOpacity
              style={[styles.voteBtn, !canSubmit && styles.voteBtnDisabled]}
              disabled={!canSubmit || loading}
              onPress={() => void handleSubmit()}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.voteBtnText}>Bình chọn</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {!localPoll.isClosed && user?.id === localPoll.creatorId && (
          <TouchableOpacity onPress={() => void handleClose()} disabled={loading}>
            <Text style={styles.closeLink}>Kết thúc bình chọn</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Detail modal */}
      <Modal visible={detailVisible} animationType="slide" onRequestClose={() => setDetailVisible(false)}>
        <View style={styles.detailModal}>
          <View style={styles.detailHeader}>
            <Text style={styles.title}>Chi tiết bình chọn</Text>
            <TouchableOpacity onPress={() => setDetailVisible(false)}>
              <Ionicons name="close" size={24} />
            </TouchableOpacity>
          </View>
          <ScrollView>
            <Text style={styles.question}>{localPoll.question}</Text>
            {localPoll.options.map((opt) => (
              <View key={opt.id} style={styles.detailOption}>
                <Text style={styles.optionText}>
                  {opt.text} — {opt.voteCount} ({opt.percent}%)
                </Text>
                {opt.voters.map((v) => (
                  <Text key={v.id} style={styles.voterName}>
                    · {v.displayName}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Add option bottom-sheet modal */}
      <Modal
        visible={addOptionVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAddModal}
        onShow={() => {
          setTimeout(() => addInputRef.current?.focus(), 100);
        }}
      >
        <KeyboardAvoidingView
          style={styles.addModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeAddModal}
          />
          <View style={styles.addModalSheet}>
            <Text style={styles.addModalTitle}>Thêm phương án mới</Text>
            <TextInput
              ref={addInputRef}
              style={styles.addModalInput}
              placeholder="Nhập phương án..."
              placeholderTextColor="#9ca3af"
              value={newOptionText}
              onChangeText={setNewOptionText}
              onSubmitEditing={() => void handleAddOption()}
              returnKeyType="done"
              maxLength={200}
            />
            <View style={styles.addModalActions}>
              <TouchableOpacity
                style={styles.addModalCancel}
                onPress={closeAddModal}
              >
                <Text style={styles.addModalCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.addModalConfirm,
                  (!newOptionText.trim() || loading) && styles.addModalConfirmDisabled,
                ]}
                disabled={!newOptionText.trim() || loading}
                onPress={() => void handleAddOption()}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.addModalConfirmText}>Thêm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    maxWidth: 320,
  },
  question: { fontSize: 16, fontWeight: '600', color: '#111' },
  subtitle: { fontSize: 12, color: '#9ca3af', marginBottom: 10, marginTop: 2 },
  option: {
    borderWidth: 1,
    borderColor: '#f3f4f6',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  optionSelected: { borderColor: '#93c5fd', backgroundColor: '#eff6ff' },
  optionHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  optionText: { fontSize: 14, color: '#1f2937', flex: 1 },
  percent: { fontSize: 12, color: '#6b7280' },
  barTrack: {
    height: 4,
    backgroundColor: '#eef2f7',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  barFill: { height: 4, backgroundColor: '#0068ff', borderRadius: 2 },
  voters: { flexDirection: 'row', marginTop: 6 },
  avatar: { width: 22, height: 22, borderRadius: 11, marginRight: -6, borderWidth: 1, borderColor: '#fff' },
  avatarPlaceholder: { backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  addOptionBtn: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderStyle: 'dashed',
    alignSelf: 'flex-start',
  },
  addOptionBtnText: { color: '#3b82f6', fontSize: 13, fontWeight: '500' },
  addModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  addModalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 12,
  },
  addModalTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 14 },
  addModalInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 16,
  },
  addModalActions: { flexDirection: 'row', gap: 10 },
  addModalCancel: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  addModalCancelText: { color: '#6b7280', fontSize: 14, fontWeight: '500' },
  addModalConfirm: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#0068ff',
    alignItems: 'center',
  },
  addModalConfirmDisabled: { opacity: 0.4 },
  addModalConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  link: { color: '#0068ff', fontSize: 13 },
  voteBtn: {
    backgroundColor: '#0068ff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  voteBtnDisabled: { opacity: 0.5 },
  voteBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  closeLink: { color: '#9ca3af', fontSize: 12, marginTop: 8, textAlign: 'center' },
  muted: { color: '#9ca3af', fontSize: 13 },
  detailModal: { flex: 1, backgroundColor: '#fff', paddingTop: 48, paddingHorizontal: 16 },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '600' },
  detailOption: { marginBottom: 16 },
  voterName: { fontSize: 13, color: '#4b5563', marginLeft: 8, marginTop: 2 },
});
