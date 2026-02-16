/**
 * SelectedMembersPanel — Right panel showing selected member tags
 *
 * Displays selected members as removable tags.
 * Scrollable with "và N người khác" overflow indicator.
 */

import { Avatar, Tag, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import {
      useCreateGroupStore,
      selectSelectedCount,
} from '../../stores/create-group.store';

const { Text } = Typography;

export function SelectedMembersPanel() {
      const selectedMembers = useCreateGroupStore((s) => s.selectedMembers);
      const selectedCount = useCreateGroupStore(selectSelectedCount);
      const removeMember = useCreateGroupStore((s) => s.removeMember);

      if (selectedCount === 0) {
            return (
                  <div className="flex items-center justify-center h-full text-gray-400">
                        <Text type="secondary" className="text-xs text-center px-2">
                              Chọn ít nhất 2 người để tạo nhóm
                        </Text>
                  </div>
            );
      }

      const members = [...selectedMembers.values()];

      return (
            <div className="flex flex-col h-full">
                  <div className="px-3 py-2 border-b border-gray-100">
                        <Text strong className="text-xs">
                              Đã chọn ({selectedCount})
                        </Text>
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                              {members.map((member) => (
                                    <Tag
                                          key={member.id}
                                          closable
                                          onClose={() => removeMember(member.id)}
                                          className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 border-blue-200"
                                    >
                                          <Avatar
                                                size={18}
                                                src={member.avatarUrl}
                                                icon={
                                                      !member.avatarUrl ? (
                                                            <UserOutlined />
                                                      ) : undefined
                                                }
                                                className="flex-shrink-0"
                                          />
                                          <span className="text-xs truncate max-w-[80px]">
                                                {member.displayName}
                                          </span>
                                    </Tag>
                              ))}
                        </div>
                  </div>
            </div>
      );
}
