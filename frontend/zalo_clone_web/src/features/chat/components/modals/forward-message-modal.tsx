import { useEffect, useMemo, useState } from 'react';
import {
    Avatar,
    Button,
    Empty,
    Input,
    Modal,
    Spin,
    Switch,
    Typography,
    notification,
} from 'antd';
import { CheckCircleFilled, SearchOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { conversationService } from '@/features/conversation';
import { messageService } from '../../api/message.api';
import {
    MAX_FORWARD_TARGETS,
    useForwardMessageStore,
} from '../../stores/forward-message.store';
import { useChatStore } from '../../stores/chat.store';

const ZALO_BLUE = '#006AF5';

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function resolveConversationTitle(conversation: { name?: string | null; id: string }) {
    return conversation.name?.trim() || `Cuộc trò chuyện ${conversation.id.slice(0, 8)}`;
}

function getInitials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (words.length === 1) return words[0][0].toUpperCase();
    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

const AVATAR_PALETTES = [
    { bg: '#E8F1FF', color: ZALO_BLUE },
    { bg: '#FDEEE8', color: '#E95F2B' },
    { bg: '#EEEBFF', color: '#6B4EFF' },
    { bg: '#E0F7F2', color: '#0DAD8D' },
    { bg: '#FCE4EC', color: '#C2185B' },
    { bg: '#F1F8E9', color: '#558B2F' },
];

function pickPalette(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

/* ─── component ───────────────────────────────────────────────────────────── */

export function ForwardMessageModal() {
    const selectedId = useChatStore((s) => s.selectedId);
    const isOpen = useForwardMessageStore((s) => s.isOpen);
    const sourceMessage = useForwardMessageStore((s) => s.sourceMessage);
    const selectedConversationIds = useForwardMessageStore((s) => s.selectedConversationIds);
    const close = useForwardMessageStore((s) => s.close);
    const toggleConversation = useForwardMessageStore((s) => s.toggleConversation);
    const clearSelections = useForwardMessageStore((s) => s.clearSelections);

    const [searchKeyword, setSearchKeyword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [includeCaption, setIncludeCaption] = useState(true);

    /* ── data ── */
    const query = useQuery({
        queryKey: ['forward-message-target-conversations'],
        queryFn: () => conversationService.getConversations({ limit: 100 }),
        enabled: isOpen,
        staleTime: 15_000,
    });

    const conversations = useMemo(() => {
        const rows = query.data?.data ?? [];
        return selectedId ? rows.filter((r) => r.id !== selectedId) : rows;
    }, [query.data?.data, selectedId]);

    const filteredConversations = useMemo(() => {
        const q = searchKeyword.trim().toLowerCase();
        if (!q) return conversations;
        return conversations.filter((c) =>
            resolveConversationTitle(c).toLowerCase().includes(q),
        );
    }, [conversations, searchKeyword]);

    const hasMedia = (sourceMessage?.mediaAttachments?.length ?? 0) > 0;

    /* ── reset on open/close ── */
    useEffect(() => {
        if (!isOpen) {
            setSearchKeyword('');
            setIsSubmitting(false);
            setIncludeCaption(true);
            return;
        }
        clearSelections();
        setIncludeCaption(true);
    }, [isOpen, clearSelections]);

    /* ── handlers ── */
    const handleToggle = (conversationId: string) => {
        const isSelected = selectedConversationIds.includes(conversationId);
        if (!isSelected && selectedConversationIds.length >= MAX_FORWARD_TARGETS) {
            notification.warning({
                message: `Bạn chỉ có thể chọn tối đa ${MAX_FORWARD_TARGETS} cuộc trò chuyện`,
                placement: 'top',
            });
            return;
        }
        toggleConversation(conversationId);
    };

    const handleSubmit = async () => {
        if (!sourceMessage || !selectedConversationIds.length) return;
        setIsSubmitting(true);
        try {
            await messageService.forwardMessage({
                sourceMessageId: sourceMessage.id,
                targetConversationIds: selectedConversationIds,
                clientRequestId: crypto.randomUUID(),
                ...(hasMedia ? { includeCaption } : {}),
            });
            notification.success({ message: 'Đã chuyển tiếp tin nhắn', placement: 'top' });
            close();
        } catch (error) {
            notification.error({
                message: 'Chuyển tiếp thất bại',
                description:
                    error instanceof Error ? error.message : 'Không thể chuyển tiếp tin nhắn lúc này',
                placement: 'top',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const sourcePreview =
        sourceMessage?.content?.trim() || (hasMedia ? 'Tệp đính kèm' : 'Tin nhắn');

    const selCount = selectedConversationIds.length;

    /* ── render ── */
    return (
        <>
            {/* Scoped styles injected once */}
            <style>{`
        .fwd-modal .ant-modal-content {
          border-radius: 12px;
          overflow: hidden;
          padding: 0;
        }
        .fwd-modal .ant-modal-header {
          padding: 16px 20px 14px;
          margin: 0;
          border-bottom: 1px solid #f0f0f0;
        }
        .fwd-modal .ant-modal-title {
          font-size: 15px;
          font-weight: 600;
          color: #111;
        }
        .fwd-modal .ant-modal-close {
          top: 14px;
          inset-inline-end: 16px;
        }
        .fwd-modal .ant-modal-body {
          padding: 0;
        }
        .fwd-modal .ant-modal-footer {
          padding: 10px 20px 14px;
          border-top: 1px solid #f0f0f0;
          margin: 0;
        }
        .fwd-conv-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 9px 20px;
          cursor: pointer;
          transition: background 0.12s;
          border-bottom: 1px solid #f5f5f5;
        }
        .fwd-conv-item:last-child { border-bottom: none; }
        .fwd-conv-item:hover { background: #f7f8fa; }
        .fwd-conv-item.selected { background: #EBF3FF; }
        .fwd-conv-item .fwd-check {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid #d9d9d9;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s;
        }
        .fwd-conv-item.selected .fwd-check {
          background: ${ZALO_BLUE};
          border-color: ${ZALO_BLUE};
        }
      `}</style>

            <Modal
                className="fwd-modal"
                title="Chuyển tiếp tin nhắn"
                open={isOpen}
                onCancel={close}
                destroyOnHidden
                width={480}
                footer={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {selCount > 0
                                ? `Đã chọn ${selCount}/${MAX_FORWARD_TARGETS} cuộc trò chuyện`
                                : `Chọn tối đa ${MAX_FORWARD_TARGETS} cuộc trò chuyện`}
                        </Typography.Text>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Button onClick={close} disabled={isSubmitting} size="middle">
                                Hủy
                            </Button>
                            <Button
                                type="primary"
                                onClick={handleSubmit}
                                loading={isSubmitting}
                                disabled={!sourceMessage || !selCount}
                                size="middle"
                                style={{ background: ZALO_BLUE, borderColor: ZALO_BLUE }}
                            >
                                Chuyển tiếp
                            </Button>
                        </div>
                    </div>
                }
            >
                {/* ── Preview ── */}
                <div
                    style={{
                        margin: '14px 20px 0',
                        background: '#f7f8fa',
                        borderRadius: 8,
                        padding: '9px 14px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        border: '1px solid #e8e8e8',
                    }}
                >
                    <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={ZALO_BLUE}
                        strokeWidth="2"
                        style={{ flexShrink: 0, marginTop: 2 }}
                    >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <div style={{ minWidth: 0 }}>
                        <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                            Nội dung chuyển tiếp
                        </Typography.Text>
                        <Typography.Text
                            ellipsis
                            style={{ fontSize: 13, display: 'block', marginTop: 2 }}
                        >
                            {sourcePreview}
                        </Typography.Text>
                    </div>
                </div>

                {/* ── Search ── */}
                <div style={{ padding: '12px 20px' }}>
                    <Input
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        placeholder="Tìm cuộc trò chuyện"
                        prefix={<SearchOutlined style={{ color: '#bbb' }} />}
                        allowClear
                        style={{ borderRadius: 8, fontSize: 13 }}
                    />
                </div>

                {/* ── Caption toggle ── */}
                {hasMedia && (
                    <div
                        style={{
                            margin: '0 20px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#f7f8fa',
                            borderRadius: 8,
                            padding: '8px 14px',
                            border: '1px solid #e8e8e8',
                        }}
                    >
                        <div>
                            <Typography.Text style={{ fontSize: 13, display: 'block' }}>
                                Giữ chú thích ảnh/video
                            </Typography.Text>
                            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                                Tắt nếu chỉ muốn gửi tệp đính kèm
                            </Typography.Text>
                        </div>
                        <Switch
                            checked={includeCaption}
                            onChange={setIncludeCaption}
                            style={{ background: includeCaption ? ZALO_BLUE : undefined }}
                        />
                    </div>
                )}

                {/* ── Conversation list ── */}
                <div
                    style={{
                        maxHeight: 300,
                        overflowY: 'auto',
                        borderTop: '1px solid #f0f0f0',
                        borderBottom: '1px solid #f0f0f0',
                    }}
                >
                    {query.isLoading ? (
                        <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}>
                            <Spin />
                        </div>
                    ) : query.isError ? (
                        <div
                            style={{
                                padding: '24px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                                Không thể tải danh sách cuộc trò chuyện
                            </Typography.Text>
                            <Button
                                size="small"
                                onClick={() => void query.refetch()}
                                loading={query.isFetching}
                            >
                                Thử lại
                            </Button>
                        </div>
                    ) : !filteredConversations.length ? (
                        <div style={{ padding: '24px 0' }}>
                            <Empty
                                description={
                                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                                        Không có cuộc trò chuyện phù hợp
                                    </Typography.Text>
                                }
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            />
                        </div>
                    ) : (
                        filteredConversations.map((conversation) => {
                            const isSelected = selectedConversationIds.includes(conversation.id);
                            const title = resolveConversationTitle(conversation);
                            const palette = pickPalette(conversation.id);

                            return (
                                <div
                                    key={conversation.id}
                                    className={`fwd-conv-item${isSelected ? ' selected' : ''}`}
                                    onClick={() => handleToggle(conversation.id)}
                                >
                                    {conversation.avatar ? (
                                        <Avatar src={conversation.avatar} size={40} />
                                    ) : (
                                        <Avatar
                                            size={40}
                                            icon={<UserOutlined />}
                                            style={{ background: palette.bg, color: palette.color, fontWeight: 600 }}
                                        >
                                            {getInitials(title)}
                                        </Avatar>
                                    )}

                                    <Typography.Text
                                        ellipsis
                                        strong={isSelected}
                                        style={{
                                            flex: 1,
                                            minWidth: 0,
                                            fontSize: 14,
                                            color: isSelected ? ZALO_BLUE : undefined,
                                        }}
                                    >
                                        {title}
                                    </Typography.Text>

                                    <div className="fwd-check">
                                        {isSelected && (
                                            <CheckCircleFilled style={{ color: '#fff', fontSize: 12 }} />
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </Modal>
        </>
    );
}