/**
 * TransferAdminModal — Modal to transfer admin role to another group member.
 *
 * Shows a list of non-admin members to choose from.
 */
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Modal, Avatar } from 'antd';
import { CrownOutlined, ExclamationCircleOutlined, UserOutlined } from '@ant-design/icons';
import type { ConversationMemberInfo } from '@/features/conversation/api/conversation.api';

interface TransferAdminModalProps {
      open: boolean;
      members: ConversationMemberInfo[];
      currentUserId: string;
      onClose: () => void;
      onTransfer: (newAdminId: string) => Promise<void>;
}

export function TransferAdminModal({
      open,
      members,
      currentUserId,
      onClose,
      onTransfer,
}: TransferAdminModalProps) {
      const { t } = useTranslation();
      const [selectedId, setSelectedId] = useState<string | null>(null);
      const [isTransferring, setIsTransferring] = useState(false);

      // Only show non-admin, non-self members
      const eligibleMembers = members.filter(
            (m) => m.id !== currentUserId && m.role !== 'ADMIN',
      );

      const handleTransfer = async () => {
            if (!selectedId) return;

            const selectedMember = eligibleMembers.find((m) => m.id === selectedId);
            if (!selectedMember) return;

            Modal.confirm({
                  title: t('conversation.transferAdmin.confirmTitle'),
                  icon: <ExclamationCircleOutlined />,
                  content: t('conversation.transferAdmin.confirmContent', { name: selectedMember.displayName }),
                  okText: t('conversation.transferAdmin.confirmOk'),
                  cancelText: t('conversation.transferAdmin.confirmCancel'),
                  onOk: async () => {
                        setIsTransferring(true);
                        try {
                              await onTransfer(selectedId);
                              handleClose();
                        } catch {
                              // Error notification handled by use-group-notifications
                        } finally {
                              setIsTransferring(false);
                        }
                  },
            });
      };

      const handleClose = () => {
            setSelectedId(null);
            onClose();
      };

      return (
            <Modal
                  title={t('conversation.transferAdmin.title')}
                  open={open}
                  onCancel={handleClose}
                  width={400}
                  destroyOnHidden
                  okText={t('conversation.transferAdmin.transfer')}
                  okButtonProps={{
                        disabled: !selectedId,
                        loading: isTransferring,
                        icon: <CrownOutlined />,
                  }}
                  onOk={handleTransfer}
                  cancelText={t('conversation.transferAdmin.cancel')}
            >
                  <p className="text-sm text-gray-500 mb-3">
                        {t('conversation.transferAdmin.description')}
                  </p>
                  <div className="max-h-[300px] overflow-y-auto">
                        {eligibleMembers.length === 0 ? (
                              <div className="text-center text-gray-400 py-8 text-sm">
                                    {t('conversation.transferAdmin.empty')}
                              </div>
                        ) : (
                              eligibleMembers.map((member) => (
                                    <div
                                          key={member.id}
                                          className={`flex items-center gap-3 px-3 py-2 cursor-pointer rounded transition-colors ${selectedId === member.id
                                                ? 'bg-blue-50 border border-blue-200'
                                                : 'hover:bg-gray-50'
                                                }`}
                                          onClick={() => setSelectedId(member.id)}
                                    >
                                          <Avatar size={36} src={member.avatarUrl} icon={<UserOutlined />} />
                                          <span className="flex-1 text-sm truncate">
                                                {member.displayName}
                                          </span>
                                          <input
                                                type="radio"
                                                checked={selectedId === member.id}
                                                readOnly
                                                className="accent-blue-500"
                                          />
                                    </div>
                              ))
                        )}
                  </div>
            </Modal>
      );
}
