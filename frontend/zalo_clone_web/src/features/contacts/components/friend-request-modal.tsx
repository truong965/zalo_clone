/**
 * FriendRequestModal — Hiển thị khi user click vào contact mà không có quyền nhắn tin
 *
 * Trường hợp: Contact có privacy settings = CONTACTS (chỉ bạn bè mới nhắn tin được)
 * → Hiện modal gợi ý gửi lời mời kết bạn.
 */

import { useTranslation } from 'react-i18next';
import { Modal, Button, Avatar, notification } from 'antd';
import { UserAddOutlined, UserOutlined } from '@ant-design/icons';
import { useSendFriendRequest } from '../api/friendship.api';
import { ApiError } from '@/lib/api-error';

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
      const { t } = useTranslation();
      const sendRequest = useSendFriendRequest();

      const handleSendRequest = () => {
            if (!target) return;
            sendRequest.mutate(target.userId, {
                  onSuccess: () => {
                        notification.success({
                              message: t('contacts.friendRequest.sendSuccess'),
                              description: t('contacts.friendRequest.sendSuccessDesc', { name: target.displayName }),
                        });
                        onClose();
                  },
                  onError: (error: unknown) => {
                        const msg = ApiError.from(error).message || t('contacts.friendRequest.sendError');
                        notification.error({ message: msg });
                  },
            });
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
                                    icon={<UserOutlined />}
                              />

                              <h3 className="text-base font-semibold text-gray-800 m-0">
                                    {target.displayName}
                              </h3>

                              <p className="text-sm text-gray-500 text-center m-0 px-4">
                                    {t('contacts.friendRequest.description')}
                              </p>

                              <div className="flex gap-2 mt-2 w-full px-4">
                                    <Button
                                          block
                                          onClick={onClose}
                                    >
                                          {t('contacts.friendRequest.close')}
                                    </Button>
                                    <Button
                                          type="primary"
                                          block
                                          icon={<UserAddOutlined />}
                                          loading={sendRequest.isPending}
                                          onClick={handleSendRequest}
                                    >
                                          {t('contacts.friendRequest.sendRequest')}
                                    </Button>
                              </div>
                        </div>
                  )}
            </Modal>
      );
}
