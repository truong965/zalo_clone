/**
 * GroupSettingsSection — Admin-only group settings.
 *
 * Includes: require approval toggle, transfer admin, dissolve group.
 */
import { useTranslation } from 'react-i18next';
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
      const { t } = useTranslation();
      if (!isAdmin) return null;

      const handleToggleApproval = (checked: boolean) => {
            return onToggleApproval(checked);
      };

      const handleDissolve = () => {
            Modal.confirm({
                  title: t('conversation.groupInfo.settingsSection.dissolveConfirmTitle'),
                  icon: <ExclamationCircleOutlined />,
                  content: t('conversation.groupInfo.settingsSection.dissolveConfirmContent'),
                  okText: t('conversation.groupInfo.settingsSection.dissolveConfirmOk'),
                  okType: 'danger',
                  cancelText: t('conversation.groupInfo.settingsSection.dissolveConfirmCancel'),
                  onOk: onDissolveGroup,
            });
      };

      return (
            <div className="border-b border-[#f4f5f7] border-b-[6px]">
                  <div className="flex items-center gap-2 px-4 py-3">
                        <SettingOutlined className="text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">
                              {t('conversation.groupInfo.settingsSection.title')}
                        </span>
                  </div>

                  <div className="px-4 pb-3 flex flex-col gap-2">
                        {/* Require Approval Toggle */}
                        <div className="flex items-center justify-between py-2 px-1">
                              <span className="text-sm text-gray-600">
                                    {t('conversation.groupInfo.settingsSection.requireApproval')}
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
                                    {t('conversation.groupInfo.settingsSection.transferAdminButton')}
                              </span>
                        </button>

                        {/* Dissolve Group */}
                        <button
                              className="flex items-center gap-3 py-2 px-1 w-full text-left hover:bg-gray-50 rounded transition-colors"
                              onClick={handleDissolve}
                        >
                              <CloseCircleOutlined className="text-red-500" />
                              <span className="text-sm text-red-500">
                                    {t('conversation.groupInfo.settingsSection.dissolveButton')}
                              </span>
                        </button>
                  </div>
            </div>
      );
}
