/**
 * FriendRequestModal — Hiển thị khi user click vào contact mà không có quyền nhắn tin
 *
 * Trường hợp: Contact có privacy settings = CONTACTS (chỉ bạn bè mới nhắn tin được)
 * → Hiện modal gợi ý gửi lời mời kết bạn.
 */

import { useState } from 'react';
import { Modal, Button, Avatar, notification } from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/constants/api-endpoints';

interface FriendRequestModalProps {
      visible: boolean;
      target: {
            userId: string;
            displayName: string;
            avatarUrl?: string;
      } | null;
      onClose: () => void;
}

export function FriendRequestModal({ visible, target, onClose }: FriendRequestModalProps) {
      const [loading, setLoading] = useState(false);

      const handleSendRequest = async () => {
            if (!target) return;
            setLoading(true);
            try {
                  await apiClient.post(API_ENDPOINTS.FRIENDS.SEND_REQUEST, {
                        friendId: target.userId,
                  });
                  notification.success({
                        message: 'Đã gửi lời mời kết bạn',
                        description: `Lời mời kết bạn đã được gửi đến ${target.displayName}`,
                  });
                  onClose();
            } catch (error: unknown) {
                  const axiosErr = error as { response?: { data?: { message?: string } } };
                  const msg = axiosErr?.response?.data?.message || 'Không thể gửi lời mời kết bạn';
                  notification.error({ message: msg });
            } finally {
                  setLoading(false);
            }
      };

      return (
            <Modal
                  open={visible}
                  onCancel={onClose}
                  footer={null}
                  centered
                  width={360}
                  title={null}
                  closable
            >
                  {target && (
                        <div className="flex flex-col items-center gap-3 py-2">
                              <Avatar
                                    src={target.avatarUrl}
                                    size={64}
                                    className="bg-blue-100 text-blue-600"
                              >
                                    {target.displayName?.charAt(0)}
                              </Avatar>

                              <h3 className="text-base font-semibold text-gray-800 m-0">
                                    {target.displayName}
                              </h3>

                              <p className="text-sm text-gray-500 text-center m-0 px-4">
                                    Người dùng này chỉ cho phép bạn bè nhắn tin. Hãy gửi lời mời kết bạn để bắt đầu trò chuyện.
                              </p>

                              <div className="flex gap-2 mt-2 w-full px-4">
                                    <Button
                                          block
                                          onClick={onClose}
                                    >
                                          Đóng
                                    </Button>
                                    <Button
                                          type="primary"
                                          block
                                          icon={<UserAddOutlined />}
                                          loading={loading}
                                          onClick={handleSendRequest}
                                    >
                                          Kết bạn
                                    </Button>
                              </div>
                        </div>
                  )}
            </Modal>
      );
}
