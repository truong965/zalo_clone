import React, { useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    ActivityIndicator,
    Avatar,
    Button,
    IconButton,
    Modal,
    Portal,
    Switch,
    Text,
    TextInput,
    useTheme,
} from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { mobileApi } from '@/services/api';
import type { Conversation } from '@/types/conversation';
import type { Message } from '@/types/message';

/* ─── constants ───────────────────────────────────────────────────────────── */

const MAX_FORWARD_TARGETS = 5;
const ZALO_BLUE = '#006AF5';
const ZALO_BLUE_LIGHT = '#EBF3FF';

const AVATAR_PALETTES = [
    { bg: '#E8F1FF', color: ZALO_BLUE },
    { bg: '#FDEEE8', color: '#E95F2B' },
    { bg: '#EEEBFF', color: '#6B4EFF' },
    { bg: '#E0F7F2', color: '#0DAD8D' },
    { bg: '#FCE4EC', color: '#C2185B' },
    { bg: '#F1F8E9', color: '#558B2F' },
];

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function resolveConversationName(conversation: Conversation): string {
    if (conversation.name?.trim()) return conversation.name;
    if (conversation.type === 'GROUP') return 'Nhóm';
    return conversation.members.find((m) => m.user)?.user?.displayName || 'Trò chuyện';
}

function getInitials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (words.length === 1) return words[0][0].toUpperCase();
    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function pickPalette(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

/* ─── props ───────────────────────────────────────────────────────────────── */

interface ForwardMessageModalProps {
    visible: boolean;
    sourceMessage: Message | null;
    currentConversationId: string;
    isSubmitting?: boolean;
    onDismiss: () => void;
    onSubmit: (payload: {
        sourceMessageId: string;
        targetConversationIds: string[];
        includeCaption?: boolean;
    }) => void;
}

/* ─── sub-components ──────────────────────────────────────────────────────── */

function CheckIcon() {
    return (
        <View style={styles.checkIconCircle}>
            {/* simple checkmark path via a tiny rotated/skewed view trick */}
            <View style={styles.checkMark} />
        </View>
    );
}

/* ─── main component ──────────────────────────────────────────────────────── */

export function ForwardMessageModal({
    visible,
    sourceMessage,
    currentConversationId,
    isSubmitting = false,
    onDismiss,
    onSubmit,
}: ForwardMessageModalProps) {
    const theme = useTheme();
    const { accessToken } = useAuth();

    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [includeCaption, setIncludeCaption] = useState(true);

    /* ── data ── */
    const query = useQuery({
        queryKey: ['forward-target-conversations', accessToken],
        queryFn: () => mobileApi.getConversations(accessToken!, { limit: 100 }),
        enabled: visible && !!accessToken,
        staleTime: 15_000,
    });

    const conversations = useMemo(() => {
        const rows = query.data?.data ?? [];
        return rows.filter((r) => r.id !== currentConversationId);
    }, [query.data?.data, currentConversationId]);

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return conversations;
        return conversations.filter((c) =>
            resolveConversationName(c).toLowerCase().includes(needle),
        );
    }, [conversations, search]);

    const hasMedia = (sourceMessage?.mediaAttachments?.length ?? 0) > 0;
    const sourcePreview =
        sourceMessage?.content?.trim() ||
        (hasMedia ? 'Nội dung sẽ được chuyển tiếp' : 'Nội dung sẽ được chuyển tiếp');

    /* ── reset ── */
    useEffect(() => {
        if (!visible) {
            setSearch('');
            setSelectedIds([]);
            setIncludeCaption(true);
            return;
        }
        setSelectedIds([]);
        setIncludeCaption(true);
    }, [visible]);

    /* ── handlers ── */
    const toggleSelected = (id: string) => {
        setSelectedIds((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            if (prev.length >= MAX_FORWARD_TARGETS) return prev;
            return [...prev, id];
        });
    };

    const handleSubmit = () => {
        if (!sourceMessage || !selectedIds.length) return;
        onSubmit({
            sourceMessageId: sourceMessage.id,
            targetConversationIds: selectedIds,
            ...(hasMedia ? { includeCaption } : {}),
        });
    };

    const selCount = selectedIds.length;

    /* ── render ── */
    return (
        <Portal>
            <Modal
                visible={visible}
                onDismiss={onDismiss}
                contentContainerStyle={styles.modalContainer}
            >
                {/* ── Header ── */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Chuyển tiếp tin nhắn</Text>
                    <IconButton
                        icon="close"
                        size={18}
                        onPress={onDismiss}
                        style={styles.closeBtn}
                        iconColor="#888"
                    />
                </View>

                <View style={styles.body}>
                    {/* ── Preview ── */}
                    <View style={styles.previewBox}>
                        <Text style={styles.previewLabel}>Nội dung chuyển tiếp</Text>
                        <Text numberOfLines={1} style={styles.previewText}>
                            {sourcePreview}
                        </Text>
                    </View>

                    {/* ── Search ── */}
                    <TextInput
                        mode="outlined"
                        dense
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Tìm cuộc trò chuyện"
                        placeholderTextColor="#aaa"
                        left={<TextInput.Icon icon="magnify" color="#aaa" />}
                        style={styles.searchInput}
                        outlineStyle={styles.searchOutline}
                        activeOutlineColor={ZALO_BLUE}
                    />

                    {/* ── Caption toggle ── */}
                    {hasMedia && (
                        <View style={styles.captionRow}>
                            <View>
                                <Text style={styles.captionTitle}>Giữ chú thích ảnh/video</Text>
                                <Text style={styles.captionSub}>Tắt nếu chỉ muốn gửi tệp đính kèm</Text>
                            </View>
                            <Switch
                                value={includeCaption}
                                onValueChange={setIncludeCaption}
                                color={ZALO_BLUE}
                            />
                        </View>
                    )}

                    {/* ── Selection count badge ── */}
                    <View style={styles.countRow}>
                        <Text style={styles.countText}>
                            {selCount > 0
                                ? `Đã chọn ${selCount}/${MAX_FORWARD_TARGETS} cuộc trò chuyện`
                                : `Chọn tối đa ${MAX_FORWARD_TARGETS} cuộc trò chuyện`}
                        </Text>
                        {selCount > 0 && (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>{selCount}/{MAX_FORWARD_TARGETS}</Text>
                            </View>
                        )}
                    </View>

                    {/* ── List ── */}
                    <View style={styles.listWrapper}>
                        {query.isLoading ? (
                            <View style={styles.centered}>
                                <ActivityIndicator color={ZALO_BLUE} />
                            </View>
                        ) : query.isError ? (
                            <View style={styles.centered}>
                                <Text style={styles.errorText}>
                                    Không thể tải danh sách cuộc trò chuyện
                                </Text>
                                <Button
                                    mode="text"
                                    onPress={() => void query.refetch()}
                                    compact
                                    textColor={ZALO_BLUE}
                                >
                                    Thử lại
                                </Button>
                            </View>
                        ) : (
                            <FlatList
                                data={filtered}
                                keyExtractor={(item) => item.id}
                                ListEmptyComponent={
                                    <View style={styles.centered}>
                                        <Text style={styles.emptyText}>
                                            Không có cuộc trò chuyện phù hợp
                                        </Text>
                                    </View>
                                }
                                ItemSeparatorComponent={() => <View style={styles.separator} />}
                                renderItem={({ item }) => {
                                    const isSelected = selectedIds.includes(item.id);
                                    const name = resolveConversationName(item);
                                    const avatarSrc = item.avatarUrl || item.avatar;
                                    const palette = pickPalette(item.id);

                                    return (
                                        <TouchableOpacity
                                            onPress={() => toggleSelected(item.id)}
                                            activeOpacity={0.7}
                                            style={[
                                                styles.convItem,
                                                isSelected && styles.convItemSelected,
                                            ]}
                                        >
                                            {avatarSrc ? (
                                                <Avatar.Image size={42} source={{ uri: avatarSrc }} />
                                            ) : (
                                                <Avatar.Text
                                                    size={42}
                                                    label={getInitials(name)}
                                                    style={{ backgroundColor: palette.bg }}
                                                    labelStyle={{ color: palette.color, fontWeight: '600' }}
                                                />
                                            )}

                                            <Text
                                                numberOfLines={1}
                                                style={[
                                                    styles.convName,
                                                    isSelected && styles.convNameSelected,
                                                ]}
                                            >
                                                {name}
                                            </Text>

                                            {/* Checkbox circle */}
                                            <View
                                                style={[
                                                    styles.checkbox,
                                                    isSelected && styles.checkboxSelected,
                                                ]}
                                            >
                                                {isSelected && (
                                                    <Text style={styles.checkTick}>✓</Text>
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                }}
                            />
                        )}
                    </View>

                    {/* ── Footer buttons ── */}
                    <View style={styles.footer}>
                        <Button
                            mode="outlined"
                            onPress={onDismiss}
                            disabled={isSubmitting}
                            style={styles.cancelBtn}
                            textColor="#555"
                        >
                            Hủy
                        </Button>
                        <Button
                            mode="contained"
                            onPress={handleSubmit}
                            loading={isSubmitting}
                            disabled={!sourceMessage || !selCount || isSubmitting}
                            style={[
                                styles.submitBtn,
                                (!sourceMessage || !selCount) && styles.submitBtnDisabled,
                            ]}
                            buttonColor={ZALO_BLUE}
                        >
                            Chuyển tiếp
                        </Button>
                    </View>
                </View>
            </Modal>
        </Portal>
    );
}

/* ─── styles ──────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    modalContainer: {
        backgroundColor: '#fff',
        marginHorizontal: 16,
        borderRadius: 14,
        maxHeight: '88%',
        overflow: 'hidden',
    },

    /* header */
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    headerTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
    },
    closeBtn: {
        margin: 0,
        marginRight: -4,
    },

    /* body */
    body: {
        padding: 16,
        gap: 12,
    },

    /* preview */
    previewBox: {
        backgroundColor: '#f7f8fa',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e8e8e8',
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    previewLabel: {
        fontSize: 11,
        color: '#888',
        marginBottom: 2,
    },
    previewText: {
        fontSize: 13,
        color: '#333',
    },

    /* search */
    searchInput: {
        backgroundColor: '#fff',
        fontSize: 13,
        height: 40,
    },
    searchOutline: {
        borderRadius: 8,
        borderColor: '#e0e0e0',
    },

    /* caption toggle */
    captionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f7f8fa',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e8e8e8',
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    captionTitle: {
        fontSize: 13,
        color: '#222',
    },
    captionSub: {
        fontSize: 11,
        color: '#888',
        marginTop: 1,
    },

    /* count */
    countRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
    },
    countText: {
        fontSize: 12,
        color: '#888',
    },
    badge: {
        backgroundColor: '#E8F1FF',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    badgeText: {
        fontSize: 11,
        color: ZALO_BLUE,
        fontWeight: '600',
    },

    /* list */
    listWrapper: {
        borderWidth: 1,
        borderColor: '#f0f0f0',
        borderRadius: 10,
        minHeight: 200,
        maxHeight: 300,
        overflow: 'hidden',
    },
    centered: {
        flex: 1,
        minHeight: 200,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 20,
    },
    errorText: {
        color: '#888',
        fontSize: 13,
        textAlign: 'center',
    },
    emptyText: {
        color: '#aaa',
        fontSize: 13,
    },

    /* conversation item */
    convItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 12,
        backgroundColor: '#fff',
    },
    convItemSelected: {
        backgroundColor: ZALO_BLUE_LIGHT,
    },
    convName: {
        flex: 1,
        fontSize: 14,
        color: '#222',
        fontWeight: '400',
    },
    convNameSelected: {
        color: ZALO_BLUE,
        fontWeight: '600',
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#d0d0d0',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    checkboxSelected: {
        backgroundColor: ZALO_BLUE,
        borderColor: ZALO_BLUE,
    },
    checkTick: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
        lineHeight: 14,
    },
    separator: {
        height: 1,
        backgroundColor: '#f5f5f5',
        marginHorizontal: 14,
    },

    /* footer */
    footer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
        paddingTop: 4,
    },
    cancelBtn: {
        borderColor: '#d0d0d0',
        borderRadius: 8,
    },
    submitBtn: {
        borderRadius: 8,
    },
    submitBtnDisabled: {
        opacity: 0.5,
    },

    /* unused but kept for reference */
    checkIconCircle: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: ZALO_BLUE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkMark: {
        width: 10,
        height: 6,
        borderBottomWidth: 2,
        borderLeftWidth: 2,
        borderColor: '#fff',
        transform: [{ rotate: '-45deg' }],
        marginTop: -2,
    },
});