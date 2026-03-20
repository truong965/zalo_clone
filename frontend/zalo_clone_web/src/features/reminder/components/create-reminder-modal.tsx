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
import { useTranslation } from 'react-i18next';
import { Modal, Input, DatePicker, notification, message } from 'antd';
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
      const { t } = useTranslation();
      const [content, setContent] = useState(defaultContent);
      const [remindAt, setRemindAt] = useState<Dayjs | null>(null);

      const handleOk = async () => {
            if (!content.trim()) {
                  void message.warning(t('reminder.createModal.emptyContentWarning'));
                  return;
            }
            if (!remindAt) {
                  void message.warning(t('reminder.createModal.noTimeWarning'));
                  return;
            }
            if (remindAt.isBefore(dayjs().add(1, 'minute'))) {
                  void message.warning(t('reminder.createModal.tooSoonWarning'));
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
                  notification.success({ message: t('reminder.createModal.createSuccess') });
            } catch {
                  // Error is handled globally by QueryClient
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
                  title={t('reminder.createModal.title')}
                  open={open}
                  onOk={handleOk}
                  onCancel={handleCancel}
                  okText={t('reminder.createModal.createButton')}
                  cancelText={t('reminder.createModal.cancelButton')}
                  confirmLoading={isSubmitting}
                  destroyOnHidden
            >
                  <div className="flex flex-col gap-4 py-2">
                        <div>
                              <label className="block text-sm font-medium text-gray-600 mb-1">
                                    {t('reminder.createModal.contentLabel')}
                              </label>
                              <TextArea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder={t('reminder.createModal.contentPlaceholder')}
                                    maxLength={500}
                                    autoSize={{ minRows: 2, maxRows: 4 }}
                                    showCount
                              />
                        </div>
                        <div>
                              <label className="block text-sm font-medium text-gray-600 mb-1">
                                    {t('reminder.createModal.timeLabel')}
                              </label>
                              <DatePicker
                                    showTime={{ format: 'HH:mm' }}
                                    format="DD/MM/YYYY HH:mm"
                                    value={remindAt}
                                    onChange={setRemindAt}
                                    disabledDate={disabledDate}
                                    placeholder={t('reminder.createModal.timePlaceholder')}
                                    className="w-full"
                                    showNow={false}
                              />
                        </div>
                        {conversationId && (
                              <p className="text-xs text-gray-400">
                                    {t('reminder.createModal.linkedNote')}
                                    {messageId && t('reminder.createModal.linkedNoteWithMessage')}
                              </p>
                        )}
                  </div>
            </Modal>
      );
}
