import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [loading, setLoading] = useState(false);

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
      setNewOptionText('');
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
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              placeholder="Thêm phương án"
              value={newOptionText}
              onChangeText={setNewOptionText}
            />
            <TouchableOpacity onPress={() => void handleAddOption()} disabled={loading}>
              <Text style={styles.link}>Thêm</Text>
            </TouchableOpacity>
          </View>
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
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 8,
    fontSize: 14,
  },
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
