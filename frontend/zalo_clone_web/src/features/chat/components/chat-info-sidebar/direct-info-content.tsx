/**
 * DirectInfoContent — DIRECT conversation info sidebar content.
 * Extracted from the original static ChatInfoSidebar UI.
 */
import { useState } from 'react';
import { Avatar, Button, Typography, Collapse, Switch, Modal } from 'antd';
import {
      EditOutlined,
      RightOutlined,
      ClockCircleOutlined,
      DeleteOutlined,
      BellOutlined,
      PushpinOutlined,
      StopOutlined,
      ExclamationCircleFilled,
} from '@ant-design/icons';
import type { ConversationUI } from '@/types/api';
import type { MediaBrowserTab } from '@/features/chat/stores/chat.store';
import { useBlockUser } from '@/features/contacts/hooks/use-block';
import { usePinConversation } from '@/features/conversation';
import { useReminders, ReminderList, CreateReminderModal } from '@/features/reminder';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { useConversationRecentMedia } from '@/features/chat/hooks/use-conversation-recent-media';
import { MediaThumbnail } from '@/features/chat/components/media-thumbnail';

const { Title } = Typography;

interface DirectInfoContentProps {
      conversation: ConversationUI;
      onOpenMediaBrowser?: (tab: MediaBrowserTab) => void;
}

export function DirectInfoContent({ conversation, onOpenMediaBrowser }: DirectInfoContentProps) {
      const blockMutation = useBlockUser();
      const { togglePin } = usePinConversation();
      const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
      const currentUserId = useAuthStore((s) => s.user?.id ?? null);
      const { reminders, isLoading: isLoadingReminders, completeReminder, deleteReminder, createReminder, isCreating: isReminderCreating } = useReminders(conversation.id);
      const [showReminders, setShowReminders] = useState(false);
      const [showCreateReminder, setShowCreateReminder] = useState(false);

      // async-parallel: two independent queries run in parallel
      const { data: recentMedia } = useConversationRecentMedia(conversation.id, ['IMAGE', 'VIDEO'], 3);
      const { data: recentFiles } = useConversationRecentMedia(conversation.id, ['FILE'], 3);

      // In a DIRECT conversation, the other user is whoever isn't us
      const otherUserId = conversation.otherUserId ?? null;
      const otherUserName = conversation.name ?? 'người dùng này';

      const handleBlockConfirm = () => {
            if (!otherUserId) return;
            blockMutation.mutate(
                  { targetUserId: otherUserId },
                  { onSettled: () => setIsBlockModalOpen(false) },
            );
      };

      const items = [
            {
                  key: '1',
                  label: <span className="font-medium">Ảnh/Video</span>,
                  children: (
                        <>
                              {!recentMedia?.length ? (
                                    <div className="text-gray-500 text-center py-2 text-xs">
                                          Chưa có Ảnh/Video được chia sẻ
                                    </div>
                              ) : (
                                    <>
                                          <div className="grid grid-cols-3 gap-1">
                                                {recentMedia.map((item) => (
                                                      <MediaThumbnail key={item.mediaId} item={item} />
                                                ))}
                                          </div>
                                          <Button
                                                type="link"
                                                size="small"
                                                className="w-full mt-1 text-xs"
                                                onClick={() => onOpenMediaBrowser?.('photos')}
                                          >
                                                Xem tất cả
                                          </Button>
                                    </>
                              )}
                        </>
                  ),
            },
            {
                  key: '2',
                  label: <span className="font-medium">File</span>,
                  children: (
                        <>
                              {!recentFiles?.length ? (
                                    <div className="text-gray-500 text-center py-2 text-xs">
                                          Chưa có File được chia sẻ
                                    </div>
                              ) : (
                                    <>
                                          <div className="flex flex-col gap-1">
                                                {recentFiles.map((item) => (
                                                      <div
                                                            key={item.mediaId}
                                                            className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer"
                                                      >
                                                            <MediaThumbnail item={item} />
                                                            <div className="flex-1 min-w-0">
                                                                  <div className="text-xs text-gray-700 truncate">
                                                                        {item.originalName}
                                                                  </div>
                                                            </div>
                                                      </div>
                                                ))}
                                          </div>
                                          <Button
                                                type="link"
                                                size="small"
                                                className="w-full mt-1 text-xs"
                                                onClick={() => onOpenMediaBrowser?.('files')}
                                          >
                                                Xem tất cả
                                          </Button>
                                    </>
                              )}
                        </>
                  ),
            },
            {
                  key: '3',
                  label: <span className="font-medium">Thiết lập bảo mật</span>,
                  children: (
                        <div className="flex flex-col gap-3">
                              <button
                                    type="button"
                                    onClick={() => setIsBlockModalOpen(true)}
                                    disabled={!otherUserId || blockMutation.isPending}
                                    className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-1 rounded w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                    <StopOutlined className="text-red-500" />
                                    <div className="flex-1">
                                          <div className="text-sm text-red-600">
                                                {blockMutation.isPending ? 'Đang chặn...' : 'Chặn người dùng'}
                                          </div>
                                    </div>
                              </button>
                              {/* <div className="flex items-center justify-between p-1">
                                    <div className="flex items-center gap-3">
                                          <EyeInvisibleOutlined className="text-gray-500" />
                                          <span className="text-sm">Ẩn trò chuyện</span>
                                    </div>
                                    <Switch size="small" />
                              </div> */}
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
                        >
                              {conversation.name?.charAt(0)}
                        </Avatar>
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
                              <div className="flex flex-col items-center gap-2 cursor-pointer group">
                                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                                          <BellOutlined className="text-gray-600 group-hover:text-blue-600" />
                                    </div>
                                    <span className="text-xs text-gray-500 text-center max-w-[60px]">
                                          Tắt thông báo
                                    </span>
                              </div>
                              <div
                                    className="flex flex-col items-center gap-2 cursor-pointer group"
                                    onClick={() => togglePin(conversation.id, !!conversation.isPinned)}
                              >
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${conversation.isPinned
                                          ? 'bg-blue-100'
                                          : 'bg-gray-100 group-hover:bg-blue-50'
                                          }`}>
                                          <PushpinOutlined className={conversation.isPinned ? 'text-blue-600' : 'text-gray-600 group-hover:text-blue-600'} />
                                    </div>
                                    <span className="text-xs text-gray-500 text-center max-w-[60px]">
                                          {conversation.isPinned ? 'Bỏ ghim' : 'Ghim hội thoại'}
                                    </span>
                              </div>
                              {/* <div className="flex flex-col items-center gap-2 cursor-pointer group">
                                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                                          <UsergroupAddOutlined className="text-gray-600 group-hover:text-blue-600" />
                                    </div>
                                    <span className="text-xs text-gray-500 text-center max-w-[60px]">
                                          Tạo nhóm
                                    </span>
                              </div> */}
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
                                    Danh sách nhắc hẹn
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
                                                Tạo nhắc hẹn
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
                                    danger
                                    block
                                    className="text-left flex items-center gap-2 h-10"
                                    icon={<DeleteOutlined />}
                              >
                                    Ẩn hội thoại
                              </Button>
                        </div>
                  </div>

                  {/* Block confirmation modal */}
                  <Modal
                        title={
                              <span className="flex items-center gap-2">
                                    <ExclamationCircleFilled className="text-red-500" />
                                    Chặn {otherUserName}?
                              </span>
                        }
                        open={isBlockModalOpen}
                        onOk={handleBlockConfirm}
                        onCancel={() => setIsBlockModalOpen(false)}
                        okText="Chặn"
                        cancelText="Hủy"
                        okButtonProps={{
                              danger: true,
                              loading: blockMutation.isPending,
                        }}
                  >
                        <p className="text-gray-600">
                              Sau khi chặn, bạn sẽ không thể gửi hoặc nhận tin nhắn từ
                              {' '}<strong>{otherUserName}</strong>.
                              Người này sẽ không được thông báo.
                        </p>
                  </Modal>

                  <CreateReminderModal
                        open={showCreateReminder}
                        onClose={() => setShowCreateReminder(false)}
                        onSubmit={createReminder}
                        conversationId={conversation.id}
                        isSubmitting={isReminderCreating}
                  />
            </>
      );
}
