/**
 * ReminderList — Displays active reminders in the info sidebar.
 *
 * Shows a collapsible section with all pending reminders for the
 * given conversation. Each reminder shows content, formatted time,
 * status tags (TRIGGERED / pending), and action buttons.
 *
 * States:
 *   PENDING:   isTriggered=false — "Sắp tới" (grey)
 *   TRIGGERED: isTriggered=true, isCompleted=false — "Đã đến hạn" (red)
 */

import { Empty, Spin, Button, Popconfirm, Tag } from 'antd';
import {
      CheckOutlined,
      DeleteOutlined,
      ClockCircleOutlined,
      BellOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';
import type { ReminderItem } from '@/types/api';

dayjs.extend(relativeTime);
dayjs.locale('vi');

interface ReminderListProps {
      reminders: ReminderItem[];
      isLoading: boolean;
      onComplete: (id: string) => void;
      onDelete: (id: string) => void;
      /** Filter to only show reminders for a specific conversation */
      conversationId?: string | null;
      /** Current user's ID — only the creator sees complete/delete buttons */
      currentUserId?: string | null;
}

export function ReminderList({
      reminders,
      isLoading,
      onComplete,
      onDelete,
      conversationId,
      currentUserId,
}: ReminderListProps) {
      // Filter by conversation if provided
      const filtered = conversationId
            ? reminders.filter((r) => r.conversationId === conversationId)
            : reminders;

      if (isLoading) {
            return (
                  <div className="flex justify-center py-4">
                        <Spin size="small" />
                  </div>
            );
      }

      if (filtered.length === 0) {
            return (
                  <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="Chưa có nhắc hẹn nào"
                        className="py-4"
                  />
            );
      }

      // Sort: triggered first, then by remindAt ascending
      const sorted = [...filtered].sort((a, b) => {
            if (a.isTriggered && !b.isTriggered) return -1;
            if (!a.isTriggered && b.isTriggered) return 1;
            return new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime();
      });

      return (
            <div className="flex flex-col gap-2 px-3 py-2">
                  {sorted.map((reminder) => {
                        const remindTime = dayjs(reminder.remindAt);
                        const isTriggered = reminder.isTriggered && !reminder.isCompleted;
                        const isPast = remindTime.isBefore(dayjs());
                        // Only the creator can complete or delete the reminder
                        const isOwner = currentUserId ? reminder.userId === currentUserId : true;

                        return (
                              <div
                                    key={reminder.id}
                                    className={`rounded-lg p-3 border ${isTriggered
                                                ? 'bg-red-50 border-red-200'
                                                : 'bg-gray-50 border-gray-100'
                                          }`}
                              >
                                    <div className="flex items-start justify-between gap-2">
                                          <div className="flex items-start gap-1.5 flex-1 min-w-0">
                                                {isTriggered && (
                                                      <BellOutlined className="text-red-500 mt-0.5 shrink-0" />
                                                )}
                                                <p className="text-sm text-gray-700 flex-1 mb-1 break-words">
                                                      {reminder.content}
                                                </p>
                                          </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-1">
                                          <div className="flex items-center gap-1.5">
                                                <ClockCircleOutlined className="text-xs text-gray-400" />
                                                <span className="text-xs text-gray-400">
                                                      {remindTime.format('DD/MM/YYYY HH:mm')}
                                                </span>
                                                {isTriggered ? (
                                                      <Tag color="red" className="text-[10px] leading-tight ml-1">
                                                            Đã đến hạn
                                                      </Tag>
                                                ) : isPast ? (
                                                      <Tag color="orange" className="text-[10px] leading-tight ml-1">
                                                            Quá hạn
                                                      </Tag>
                                                ) : null}
                                          </div>
                                          <div className="flex items-center gap-1">
                                                {isOwner && (
                                                      <>
                                                            <Button
                                                                  type="text"
                                                                  size="small"
                                                                  icon={<CheckOutlined />}
                                                                  className={
                                                                        isTriggered
                                                                              ? 'text-red-500 hover:text-red-600'
                                                                              : 'text-green-500 hover:text-green-600'
                                                                  }
                                                                  onClick={() => onComplete(reminder.id)}
                                                                  title={isTriggered ? 'Xác nhận đã xem' : 'Hoàn thành'}
                                                            />
                                                            <Popconfirm
                                                                  title="Xóa nhắc hẹn này?"
                                                                  onConfirm={() => onDelete(reminder.id)}
                                                                  okText="Xóa"
                                                                  cancelText="Hủy"
                                                            >
                                                                  <Button
                                                                        type="text"
                                                                        size="small"
                                                                        icon={<DeleteOutlined />}
                                                                        className="text-gray-400 hover:text-red-500"
                                                                        title="Xóa"
                                                                  />
                                                            </Popconfirm>
                                                      </>
                                                )}
                                          </div>
                                    </div>
                              </div>
                        );
                  })}
            </div>
      );
}
