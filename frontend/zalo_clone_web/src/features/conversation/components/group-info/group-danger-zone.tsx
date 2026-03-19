/**
 * GroupDangerZone — Danger actions: leave group, delete history, report.
 *
 * Admin sees a warning if they try to leave without transferring admin first.
 */
import { useTranslation } from 'react-i18next';
import { Button, Modal } from 'antd';
import {
      InboxOutlined,
      LogoutOutlined,
      ExclamationCircleOutlined,
} from '@ant-design/icons';

interface GroupDangerZoneProps {
      isAdmin: boolean;
      isArchived: boolean;
      memberCount: number;
      onLeaveGroup: () => Promise<void>;
      onArchiveConversation: () => void;
}

export function GroupDangerZone({
      isAdmin,
      isArchived,
      memberCount,
      onLeaveGroup,
      onArchiveConversation,
}: GroupDangerZoneProps) {
      const { t } = useTranslation();
      const handleLeave = () => {
            // R1: Admin cannot leave — show a helpful message
            if (isAdmin) {
                  if (memberCount <= 1) {
                        // Solo admin — suggest dissolve
                        Modal.warning({
                              title: t('conversation.groupInfo.dangerZone.cannotLeaveTitle'),
                              content: t('conversation.groupInfo.dangerZone.soloAdminContent'),
                              okText: t('conversation.groupInfo.dangerZone.understood'),
                        });
                  } else {
                        Modal.warning({
                              title: t('conversation.groupInfo.dangerZone.cannotLeaveTitle'),
                              content: t('conversation.groupInfo.dangerZone.adminContent'),
                              okText: t('conversation.groupInfo.dangerZone.understood'),
                        });
                  }
                  return;
            }

            Modal.confirm({
                  title: t('conversation.groupInfo.dangerZone.leaveConfirmTitle'),
                  icon: <ExclamationCircleOutlined />,
                  content: t('conversation.groupInfo.dangerZone.leaveConfirmContent'),
                  okText: t('conversation.groupInfo.dangerZone.leaveConfirmOk'),
                  okType: 'danger',
                  cancelText: t('conversation.groupInfo.dangerZone.leaveConfirmCancel'),
                  onOk: () => onLeaveGroup().catch(() => {}), // catch error to close modal even if notify error occurred
            });
      };

      return (
            <div className="p-2">
                  <Button
                        type="text"
                        block
                        className="h-10 px-4"
                        onClick={onArchiveConversation}
                  >
                        {/* Cấu trúc lại children thay vì dùng prop icon */}
                        <span className="flex items-center justify-start gap-2 w-full text-gray-700">
                              <InboxOutlined />
                              <span>{isArchived ? t('conversation.groupInfo.dangerZone.unarchiveButton') : t('conversation.groupInfo.dangerZone.archiveButton')}</span>
                        </span>
                  </Button>

                  <Button
                        type="text"
                        danger
                        block
                        className="h-10 px-4 mt-1"
                        onClick={handleLeave}
                  >
                        {/* Cấu trúc lại children thay vì dùng prop icon */}
                        <span className="flex items-center justify-start gap-2 w-full">
                              <LogoutOutlined />
                              <span>{t('conversation.groupInfo.dangerZone.leaveButton')}</span>
                        </span>
                  </Button>
            </div>
      );
}
