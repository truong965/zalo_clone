/**
 * GroupResult — Search result card for groups
 *
 * Hiển thị:
 * - Group avatar + name + member count
 * - Members preview (first 3 names)
 * - Badge: Đã tham gia / Chưa tham gia
 */

import { Avatar, Typography, Tag } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import type { GroupSearchResult } from '../types';
import { formatSearchTimestamp } from '../utils/search.util';

const { Text } = Typography;

interface GroupResultProps {
      data: GroupSearchResult;
      onClick?: (result: GroupSearchResult) => void;
}

export function GroupResult({ data, onClick }: GroupResultProps) {
      const membersText =
            data.membersPreview.length > 0
                  ? data.membersPreview.slice(0, 3).join(', ')
                  : `${data.memberCount} thành viên`;

      return (
            <div
                  className="flex items-center gap-3 px-3 py-3 cursor-pointer rounded-lg hover:bg-gray-50 transition-colors"
                  onClick={() => onClick?.(data)}
            >
                  {/* Avatar */}
                  <Avatar
                        size={44}
                        src={data.avatarUrl || undefined}
                        className={!data.avatarUrl ? 'bg-orange-400' : ''}
                        icon={!data.avatarUrl ? <TeamOutlined /> : undefined}
                  >
                        {data.name?.[0]?.toUpperCase() ?? 'G'}
                  </Avatar>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                              <Text strong className="truncate text-sm text-gray-800">
                                    {data.name}
                              </Text>
                              <Tag
                                    className="text-[10px] leading-none border-0 m-0"
                                    color={data.isUserMember ? 'green' : 'default'}
                              >
                                    {data.isUserMember ? 'Đã tham gia' : 'Chưa tham gia'}
                              </Tag>
                        </div>
                        <Text className="text-xs text-gray-500 block truncate">
                              <TeamOutlined className="mr-1" />
                              {data.memberCount} thành viên
                              {data.membersPreview.length > 0 && ` · ${membersText}`}
                        </Text>
                        {data.lastMessageAt && (
                              <Text className="text-[11px] text-gray-400 block mt-0.5">
                                    Hoạt động {formatSearchTimestamp(data.lastMessageAt)}
                              </Text>
                        )}
                  </div>
            </div>
      );
}
