/**
 * CreateReminderModal — Modal for creating a new reminder.
 *
 * Can be triggered from:
 * 1. Message context menu → pre-fills conversationId + messageId
 * 2. Info sidebar → pre-fills conversationId only
 *
 * Uses Ant Design DatePicker + TextArea. Validates remindAt >= 1 minute from now.
 */

import { useState } from 'react';
import { Modal, Input, DatePicker, message } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { CreateReminderParams } from '@/types/api';

const { TextArea } = Input;

interface CreateReminderModalProps {
      open: boolean;
      onClose: () => void;
      onSubmit: (params: CreateReminderParams) => Promise<unknown>;
      conversationId?: string | null;
      messageId?: string | null;
      /** Pre-fill content from message */
      defaultContent?: string;
      isSubmitting?: boolean;
}

export function CreateReminderModal({
      open,
      onClose,
      onSubmit,
      conversationId,
      messageId,
      defaultContent = '',
      isSubmitting = false,
}: CreateReminderModalProps) {
      const [content, setContent] = useState(defaultContent);
      const [remindAt, setRemindAt] = useState<Dayjs | null>(null);

      const handleOk = async () => {
            if (!content.trim()) {
                  void message.warning('Vui lòng nhập nội dung nhắc hẹn.');
                  return;
            }
            if (!remindAt) {
                  void message.warning('Vui lòng chọn thời gian nhắc hẹn.');
                  return;
            }
            if (remindAt.isBefore(dayjs().add(1, 'minute'))) {
                  void message.warning('Thời gian nhắc hẹn phải ít nhất 1 phút trong tương lai.');
                  return;
            }

            try {
                  await onSubmit({
                        content: content.trim(),
                        remindAt: remindAt.toISOString(),
                        ...(conversationId ? { conversationId } : {}),
                        ...(messageId ? { messageId } : {}),
                  });
                  // Reset & close
                  setContent('');
                  setRemindAt(null);
                  onClose();
                  void message.success('Đã tạo nhắc hẹn!');
            } catch {
                  void message.error('Không thể tạo nhắc hẹn. Vui lòng thử lại.');
            }
      };

      const handleCancel = () => {
            setContent('');
            setRemindAt(null);
            onClose();
      };

      // Disable past dates
      const disabledDate = (current: Dayjs) => current.isBefore(dayjs().startOf('day'));

      return (
            <Modal
                  title="⏰ Tạo nhắc hẹn"
                  open={open}
                  onOk={handleOk}
                  onCancel={handleCancel}
                  okText="Tạo"
                  cancelText="Hủy"
                  confirmLoading={isSubmitting}
                  destroyOnClose
            >
                  <div className="flex flex-col gap-4 py-2">
                        <div>
                              <label className="block text-sm font-medium text-gray-600 mb-1">
                                    Nội dung nhắc hẹn
                              </label>
                              <TextArea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="Nhập nội dung nhắc hẹn..."
                                    maxLength={500}
                                    autoSize={{ minRows: 2, maxRows: 4 }}
                                    showCount
                              />
                        </div>
                        <div>
                              <label className="block text-sm font-medium text-gray-600 mb-1">
                                    Thời gian nhắc
                              </label>
                              <DatePicker
                                    showTime={{ format: 'HH:mm' }}
                                    format="DD/MM/YYYY HH:mm"
                                    value={remindAt}
                                    onChange={setRemindAt}
                                    disabledDate={disabledDate}
                                    placeholder="Chọn ngày giờ"
                                    className="w-full"
                                    showNow={false}
                              />
                        </div>
                        {conversationId && (
                              <p className="text-xs text-gray-400">
                                    Nhắc hẹn sẽ liên kết với cuộc trò chuyện hiện tại.
                                    {messageId && ' và tin nhắn đã chọn.'}
                              </p>
                        )}
                  </div>
            </Modal>
      );
}
