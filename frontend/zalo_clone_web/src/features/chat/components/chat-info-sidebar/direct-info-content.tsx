/**
 * DirectInfoContent — DIRECT conversation info sidebar content.
 * Extracted from the original static ChatInfoSidebar UI.
 */
import { useState } from 'react';
import { Avatar, Button, Typography, Collapse, Modal } from 'antd';
import {
      EditOutlined,
      RightOutlined,
      ClockCircleOutlined,
      InboxOutlined,
      BellOutlined,
      PushpinOutlined,
      StopOutlined,
      UserOutlined,
} from '@ant-design/icons';
import { BellSlashedIcon } from '@/components/icons/bell-slashed';
import type { ConversationUI } from '@/types/api';
import type { MediaBrowserTab } from '@/features/chat/stores/chat.store';
import { useBlockUser } from '@/hooks/use-block';
import { useConversation } from '@/hooks/use-conversation';
import { useInvalidateConversations } from '@/features/conversation/hooks/use-conversation-queries';
import { useReminders, ReminderList, CreateReminderModal } from '@/features/reminder';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { useConversationRecentMedia } from '@/features/chat/hooks/use-conversation-recent-media';
import { MediaThumbnail } from '@/features/chat/components/media-thumbnail';
import { MediaPreviewModal } from '@/features/chat/components/media-preview-modal';
import { RecentFileItem } from '@/features/chat/components/recent-file-item';
import { useTranslation } from 'react-i18next';

const { Title } = Typography;

interface DirectInfoContentProps {
      conversation: ConversationUI;
      onTogglePin: (conversationId: string, currentlyPinned: boolean) => void;
      onToggleMute: (conversationId: string, currentlyMuted: boolean) => void;
      onToggleArchive: (conversationId: string, currentlyArchived: boolean) => void;
      isArchiving: boolean;
      onOpenMediaBrowser?: (tab: MediaBrowserTab) => void;
      onCloseSidebar: () => void;
}

export function DirectInfoContent({
      conversation,
      onTogglePin,
      onToggleMute,
      onToggleArchive,
      isArchiving,
      onOpenMediaBrowser,
      onCloseSidebar,
}: DirectInfoContentProps) {
      const { t } = useTranslation();
      const { clearCurrentConversation } = useConversation();
      const { mutateAsync: blockUserAsync, isPending: isBlocking } = useBlockUser();
      const { removeFromCache, invalidateAll } = useInvalidateConversations();
      const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
      const currentUserId = useAuthStore((s) => s.user?.id ?? null);
      const { reminders, isLoading: isLoadingReminders, completeReminder, deleteReminder, createReminder, isCreating: isReminderCreating } = useReminders(conversation.id);
      const [showReminders, setShowReminders] = useState(false);
      const [showCreateReminder, setShowCreateReminder] = useState(false);

      const [previewItems, setPreviewItems] = useState<any[]>([]);
      const [previewIndex, setPreviewIndex] = useState(-1);

      // async-parallel: two independent queries run in parallel
      const { data: recentMedia } = useConversationRecentMedia(conversation.id, ['IMAGE', 'VIDEO'], 3);
      const { data: recentFiles } = useConversationRecentMedia(conversation.id, ['FILE'], 3);

      // In a DIRECT conversation, the other user is whoever isn't us
      const otherUserId = conversation.otherUserId ?? null;
      const otherUserName = conversation.name ?? t('chat.conversationItem.anonymous');

      const handleBlockConfirm = () => {
            if (!otherUserId) return;

            Modal.confirm({
                  title: (
                        <span className="flex items-center gap-2">
                              {t('chat.infoSidebar.blockConfirmTitle', { name: otherUserName })}
                        </span>
                  ),
                  content: (
                        <p >
                              {t('chat.infoSidebar.blockWarning', { name: otherUserName })}
                        </p>
                  ),
                  okText: t('chat.infoSidebar.block'),
                  okType: 'danger',
                  okButtonProps: { danger: true, loading: isBlocking },
                  onOk: async () => {
                        try {
                              // 1. GỌI API CHẶN (REST API)
                              await blockUserAsync({ targetUserId: otherUserId, reason: 'N/A' });

                              // 2. ĐÓNG SIDEBAR
                              onCloseSidebar();

                              // 3. XÓA CUỘC TRÒ CHUYỆN KHỎI MÀN HÌNH CHÍNH
                              clearCurrentConversation();

                              // 4. XÓA CACHE ĐỂ TRÁNH LỖI KHI REFETCH
                              await removeFromCache(conversation.id);

                              // 5. LÀM MỚI TOÀN BỘ DANH SÁCH CONVERSATION
                              void invalidateAll();
                        } catch (error) {
                              console.error('Failed to block user within UI context:', error);
                        }
                  },
            });
      };

      const items = [
            {
                  key: '1',
                  label: <span className="font-medium">{t('chat.infoSidebar.media')}</span>,
                  children: (
                        <>
                              {!recentMedia?.length ? (
                                    <div className="text-gray-500 text-center py-2 text-xs">
                                          {t('chat.infoSidebar.noMedia')}
                                    </div>
                              ) : (
                                    <>
                                          <div className="grid grid-cols-3 gap-1">
                                                {recentMedia.map((item, idx) => (
                                                      <MediaThumbnail
                                                            key={item.mediaId}
                                                            item={item}
                                                            onClick={() => {
                                                                  setPreviewItems(recentMedia);
                                                                  setPreviewIndex(idx);
                                                            }}
                                                      />
                                                ))}
                                          </div>
                                          <Button
                                                type="link"
                                                size="small"
                                                className="w-full mt-1 text-xs"
                                                onClick={() => onOpenMediaBrowser?.('photos')}
                                          >
                                                {t('chat.infoSidebar.viewAll')}
                                          </Button>
                                    </>
                              )}
                        </>
                  ),
            },
            {
                  key: '2',
                  label: <span className="font-medium">{t('chat.infoSidebar.file')}</span>,
                  children: (
                        <>
                              {!recentFiles?.length ? (
                                    <div className="text-gray-500 text-center py-2 text-xs">
                                          {t('chat.infoSidebar.noFile')}
                                    </div>
                              ) : (
                                    <>
                                          <div className="flex flex-col">
                                                {recentFiles.map((item) => (
                                                      <RecentFileItem
                                                            key={item.mediaId}
                                                            originalName={item.originalName}
                                                            sizeBytes={item.size}
                                                            createdAt={item.createdAt}
                                                            cdnUrl={item.cdnUrl}
                                                            mimeType={item.mimeType}
                                                      />
                                                ))}
                                          </div>
                                          <Button
                                                type="link"
                                                size="small"
                                                className="w-full mt-1 text-xs"
                                                onClick={() => onOpenMediaBrowser?.('files')}
                                          >
                                                {t('chat.infoSidebar.viewAll')}
                                          </Button>
                                    </>
                              )}
                        </>
                  ),
            },
            {
                  key: '3',
                  label: <span className="font-medium">{t('chat.infoSidebar.security')}</span>,
                  children: (
                        <div className="flex flex-col gap-3">
                              <button
                                    type="button"
                                    onClick={handleBlockConfirm}
                                    disabled={!otherUserId || isBlocking}
                                    className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-1 rounded w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                    <StopOutlined className="text-red-500" />
                                    <div className="flex-1">
                                          <div className="text-sm text-red-600">
                                                {isBlocking ? t('chat.infoSidebar.blocking') : t('chat.infoSidebar.block')}
                                          </div>
                                    </div>
                              </button>
                        </div>
                  ),
            },
      ];

      return (
            <>
                  {/* Profile Section */}
                  <div className="flex-none flex flex-col items-center py-6 bg-white border-b border-gray-100 border-[6px] border-b-[#f4f5f7]">
                        <Avatar
                              size={64}
                              src={conversation.avatar}
                              className="mb-3 border border-gray-200"
                              icon={<UserOutlined />}
                        />
                        <div className="flex items-center gap-2 mb-4">
                              <Title level={4} className="m-0">
                                    {conversation.name || 'Chat'}
                              </Title>
                              <Button
                                    type="text"
                                    size="small"
                                    icon={<EditOutlined className="text-gray-400" />}
                              />
                        </div>

                        {/* 3 Quick Actions */}
                        <div className="flex gap-8 justify-center w-full px-4">
                              <div
                                    className="flex flex-col items-center gap-2 cursor-pointer group"
                                    onClick={() => onToggleMute(conversation.id, !!conversation.isMuted)}
                              >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${conversation.isMuted
                                          ? 'bg-blue-100'
                                          : 'bg-gray-100 group-hover:bg-blue-50'
                                          }`}>
                                          {conversation.isMuted
                                                ? <BellSlashedIcon className="text-blue-600" />
                                                : <BellOutlined className="text-gray-600 group-hover:text-blue-600" />
                                          }
                                    </div>
                                    <span className="text-xs text-gray-500 text-center max-w-[60px]">
                                          {conversation.isMuted ? t('chat.infoSidebar.unmute') : t('chat.infoSidebar.mute')}
                                    </span>
                              </div>
                              <div
                                    className="flex flex-col items-center gap-2 cursor-pointer group"
                                    onClick={() => onTogglePin(conversation.id, !!conversation.isPinned)}
                              >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${conversation.isPinned
                                          ? 'bg-blue-100 text-blue-600'
                                          : 'bg-gray-100 group-hover:bg-blue-50'
                                          }`}>
                                          <PushpinOutlined className={conversation.isPinned ? 'text-blue-600' : 'text-gray-600 group-hover:text-blue-600'} />
                                    </div>

                                    <span className="text-xs text-gray-500 text-center max-w-[60px]">
                                          {conversation.isPinned ? t('chat.infoSidebar.unpin') : t('chat.infoSidebar.pin')}
                                    </span>
                              </div>
                        </div>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto">
                        <div
                              className="p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 border-b border-[#f4f5f7] border-b-[6px]"
                              onClick={() => setShowReminders((v) => !v)}
                        >
                              <ClockCircleOutlined className="text-gray-500 text-lg" />
                              <span className="text-sm font-medium text-gray-600 flex-1">
                                    {t('chat.infoSidebar.reminders')}
                              </span>
                              <RightOutlined
                                    rotate={showReminders ? 90 : 0}
                                    className="text-xs text-gray-400 transition-transform"
                              />
                        </div>
                        {showReminders && (
                              <div className="border-b border-[#f4f5f7] border-b-[6px]">
                                    <div className="px-3 pt-2 pb-1">
                                          <Button
                                                type="dashed"
                                                block
                                                size="small"
                                                icon={<ClockCircleOutlined />}
                                                onClick={() => setShowCreateReminder(true)}
                                          >
                                                {t('chat.infoSidebar.createReminder')}
                                          </Button>
                                    </div>
                                    <ReminderList
                                          reminders={reminders}
                                          isLoading={isLoadingReminders}
                                          onComplete={completeReminder}
                                          onDelete={deleteReminder}
                                          currentUserId={currentUserId}
                                    />
                              </div>
                        )}

                        <Collapse
                              ghost
                              expandIconPlacement="end"
                              expandIcon={({ isActive }) => (
                                    <RightOutlined
                                          rotate={isActive ? 90 : 0}
                                          className="text-xs text-gray-400"
                                    />
                              )}
                              items={items}
                              className="site-collapse-custom-collapse"
                        />

                        <div className="border-t border-[#f4f5f7] border-t-[6px] p-2">
                              <Button
                                    type="text"
                                    block
                                    className="gap-2 h-10"
                                    icon={<InboxOutlined />}
                                    loading={isArchiving}
                                    onClick={() => setIsArchiveModalOpen(true)}
                              >
                                    <span className="flex items-center justify-start gap-2 w-full text-gray-700">
                                          <span>{conversation.isArchived ? t('chat.infoSidebar.unarchive') : t('chat.infoSidebar.archive')}</span>
                                    </span>
                              </Button>
                        </div>
                  </div>

                  {/* Archive confirmation modal */}
                  <Modal
                        title={conversation.isArchived ? t('chat.infoSidebar.unarchiveModalTitle') : t('chat.infoSidebar.archiveModalTitle')}
                        open={isArchiveModalOpen}
                        onOk={() => {
                              onToggleArchive(conversation.id, !!conversation.isArchived);
                              setIsArchiveModalOpen(false);
                              onCloseSidebar();
                        }}
                        onCancel={() => setIsArchiveModalOpen(false)}
                        okText={conversation.isArchived ? t('chat.infoSidebar.unarchiveModalOk') : t('chat.infoSidebar.archiveModalOk')}
                        cancelText={t('chat.infoSidebar.blockConfirmCancel')}
                  >
                        <p className="text-gray-600">
                              {conversation.isArchived
                                    ? t('chat.infoSidebar.unarchiveWarning')
                                    : t('chat.infoSidebar.archiveWarning')
                              }
                        </p>
                  </Modal>

                  <CreateReminderModal
                        open={showCreateReminder}
                        onClose={() => setShowCreateReminder(false)}
                        onSubmit={createReminder}
                        conversationId={conversation.id}
                        isSubmitting={isReminderCreating}
                  />

                  <MediaPreviewModal
                        isOpen={previewIndex !== -1}
                        items={previewItems ?? []}
                        initialIndex={previewIndex}
                        onClose={() => setPreviewIndex(-1)}
                  />
            </>
      );
}
