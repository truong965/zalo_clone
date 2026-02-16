/**
 * GroupSettingsSection — Admin-only group settings.
 *
 * Includes: require approval toggle, transfer admin, dissolve group.
 */
import { Switch, Modal } from 'antd';
import {
      SwapOutlined,
      ExclamationCircleOutlined,
      SettingOutlined,
      CloseCircleOutlined,
} from '@ant-design/icons';

interface GroupSettingsSectionProps {
      isAdmin: boolean;
      requireApproval: boolean;
      onToggleApproval: (value: boolean) => Promise<void>;
      onTransferAdmin: () => void;
      onDissolveGroup: () => void;
}

export function GroupSettingsSection({
      isAdmin,
      requireApproval,
      onToggleApproval,
      onTransferAdmin,
      onDissolveGroup,
}: GroupSettingsSectionProps) {
      if (!isAdmin) return null;

      const handleToggleApproval = async (checked: boolean) => {
            try {
                  await onToggleApproval(checked);
            } catch {
                  // Error notification handled by use-group-notifications
            }
      };

      const handleDissolve = () => {
            Modal.confirm({
                  title: 'Giải tán nhóm',
                  icon: <ExclamationCircleOutlined />,
                  content:
                        'Bạn có chắc chắn muốn giải tán nhóm? Tất cả tin nhắn và dữ liệu nhóm sẽ bị xóa. Hành động này không thể hoàn tác.',
                  okText: 'Giải tán',
                  okType: 'danger',
                  cancelText: 'Hủy',
                  onOk: onDissolveGroup,
            });
      };

      return (
            <div className="border-b border-[#f4f5f7] border-b-[6px]">
                  <div className="flex items-center gap-2 px-4 py-3">
                        <SettingOutlined className="text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">
                              Thiết lập nhóm
                        </span>
                  </div>

                  <div className="px-4 pb-3 flex flex-col gap-2">
                        {/* Require Approval Toggle */}
                        <div className="flex items-center justify-between py-2 px-1">
                              <span className="text-sm text-gray-600">
                                    Phê duyệt thành viên mới
                              </span>
                              <Switch
                                    size="small"
                                    checked={requireApproval}
                                    onChange={handleToggleApproval}
                              />
                        </div>

                        {/* Transfer Admin */}
                        <button
                              className="flex items-center gap-3 py-2 px-1 w-full text-left hover:bg-gray-50 rounded transition-colors"
                              onClick={onTransferAdmin}
                        >
                              <SwapOutlined className="text-gray-500" />
                              <span className="text-sm text-gray-600">
                                    Chuyển quyền trưởng nhóm
                              </span>
                        </button>

                        {/* Dissolve Group */}
                        <button
                              className="flex items-center gap-3 py-2 px-1 w-full text-left hover:bg-gray-50 rounded transition-colors"
                              onClick={handleDissolve}
                        >
                              <CloseCircleOutlined className="text-red-500" />
                              <span className="text-sm text-red-500">
                                    Giải tán nhóm
                              </span>
                        </button>
                  </div>
            </div>
      );
}
