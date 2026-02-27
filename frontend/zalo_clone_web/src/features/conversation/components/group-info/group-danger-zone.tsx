/**
 * GroupDangerZone — Danger actions: leave group, delete history, report.
 *
 * Admin sees a warning if they try to leave without transferring admin first.
 */
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
      const handleLeave = () => {
            // R1: Admin cannot leave — show a helpful message
            if (isAdmin) {
                  if (memberCount <= 1) {
                        // Solo admin — suggest dissolve
                        Modal.warning({
                              title: 'Không thể rời nhóm',
                              content:
                                    'Bạn là thành viên duy nhất trong nhóm. Hãy giải tán nhóm nếu không cần nữa.',
                              okText: 'Đã hiểu',
                        });
                  } else {
                        Modal.warning({
                              title: 'Không thể rời nhóm',
                              content:
                                    'Bạn là trưởng nhóm. Vui lòng chuyển quyền trưởng nhóm cho thành viên khác trước khi rời.',
                              okText: 'Đã hiểu',
                        });
                  }
                  return;
            }

            Modal.confirm({
                  title: 'Rời nhóm',
                  icon: <ExclamationCircleOutlined />,
                  content:
                        'Bạn có chắc chắn muốn rời khỏi nhóm? Bạn sẽ không thể xem tin nhắn mới của nhóm.',
                  okText: 'Rời nhóm',
                  okType: 'danger',
                  cancelText: 'Hủy',
                  onOk: async () => {
                        try {
                              await onLeaveGroup();
                        } catch {
                              // Error notification handled by use-group-notifications
                        }
                  },
            });
      };

      return (
            <div className="p-2">
                  <Button
                        type="text"
                        block
                        className="text-left flex items-center gap-2 h-10"
                        icon={<InboxOutlined />}
                        onClick={onArchiveConversation}
                  >
                        {isArchived ? 'Bỏ lưu trữ' : 'Lưu trữ hội thoại'}
                  </Button>
                  <Button
                        type="text"
                        danger
                        block
                        className="text-left flex items-center gap-2 h-10"
                        icon={<LogoutOutlined />}
                        onClick={handleLeave}
                  >
                        Rời nhóm
                  </Button>
            </div>
      );
}
