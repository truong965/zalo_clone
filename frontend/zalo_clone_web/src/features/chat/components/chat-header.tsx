import { useMemo, useState } from 'react';
import { Avatar, Button, Dropdown, Typography } from 'antd';
import {
      SearchOutlined,
      VideoCameraOutlined,
      LayoutOutlined,
      MoreOutlined,
      EditOutlined,
      DeleteOutlined,
} from '@ant-design/icons';
import {
      useContactCheck,
      AliasEditModal,
} from '@/features/contacts';

const { Title } = Typography;

interface ChatHeaderProps {
      conversationName: string;
      avatarUrl?: string | null;
      isDirect?: boolean;
      isOnline?: boolean;
      lastSeenAt?: string | null;
      onToggleSearch: () => void;
      onToggleInfo: () => void;
      typingText?: string | null;
      /** Present for 1-to-1 conversations; used to load contact / alias info. */
      otherUserId?: string | null;
}

export function ChatHeader({
      conversationName,
      avatarUrl,
      isDirect,
      isOnline,
      lastSeenAt,
      onToggleSearch,
      onToggleInfo,
      typingText,
      otherUserId,
}: ChatHeaderProps) {
      const [aliasModalOpen, setAliasModalOpen] = useState(false);

      // Only enabled for 1-to-1 conversations
      const { data: contactInfo } = useContactCheck(isDirect ? otherUserId : null);
      const getPresenceInfo = (iso: string): { text: string; isRecent: boolean } => {
            const date = new Date(iso);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);

            if (diffMins < 1) return { text: 'Truy cập 1 phút trước', isRecent: true };
            if (diffMins < 5) return { text: `Truy cập ${diffMins} phút trước`, isRecent: true };
            if (diffMins < 10) return { text: `Truy cập ${diffMins} phút trước`, isRecent: true };
            if (diffMins < 30) return { text: `Truy cập ${diffMins} phút trước`, isRecent: true };
            if (diffMins < 60) return { text: `Truy cập ${diffMins} phút trước`, isRecent: true };
            return { text: 'Ngoại tuyến', isRecent: false };
      };

      const presenceInfo = (() => {
            if (!isDirect) return null;
            if (isOnline) return { text: 'Đang hoạt động', isRecent: true };
            if (lastSeenAt) return getPresenceInfo(lastSeenAt);
            return { text: 'Ngoại tuyến', isRecent: false };
      })();

      // Build the "More" dropdown menu — memoised to avoid per-render object allocation.
      const moreMenuItems = useMemo(() => {
            if (!isDirect || !otherUserId) return [];
            return [
                  {
                        key: 'set-alias',
                        label: contactInfo?.aliasName ? 'Chỉnh sửa biệt danh' : 'Đặt biệt danh',
                        icon: <EditOutlined />,
                        onClick: () => setAliasModalOpen(true),
                  },
                  ...(contactInfo?.aliasName
                        ? [
                              {
                                    key: 'clear-alias',
                                    label: 'Xoá biệt danh',
                                    icon: <DeleteOutlined />,
                                    danger: true,
                                    onClick: () => setAliasModalOpen(true),
                              },
                        ]
                        : []),
            ];
      }, [isDirect, otherUserId, contactInfo?.aliasName]);

      return (
            <>
                  <div className="h-16 px-4 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm z-10 flex-none">
                        <div className="flex items-center gap-3">
                              <Avatar size="large" src={avatarUrl ?? undefined} className="bg-blue-500">
                                    {conversationName?.[0]?.toUpperCase() ?? 'U'}
                              </Avatar>
                              <div>
                                    <Title level={5} className="mb-0 !text-gray-800">{conversationName}</Title>
                                    {typingText ? (
                                          <div className="flex items-center text-xs text-blue-600">
                                                {typingText}
                                          </div>
                                    ) : presenceInfo ? (
                                          <div className="flex items-center text-xs text-gray-500">
                                                <span
                                                      className={`w-2 h-2 rounded-full mr-1.5 ${presenceInfo.isRecent ? 'bg-green-500' : 'bg-gray-400'}`}
                                                ></span>
                                                {presenceInfo.text}
                                          </div>
                                    ) : null}
                              </div>
                        </div>

                        <div className="flex gap-1">
                              {/* <Button
                              icon={<UsergroupAddOutlined />}
                              type="text"
                              className="text-gray-500 hover:bg-gray-100"
                              title="Thêm thành viên"
                        /> */}
                              <Button
                                    icon={<VideoCameraOutlined />}
                                    type="text"
                                    className="text-gray-500 hover:bg-gray-100"
                                    title="Cuộc gọi video"
                              />
                              <Button
                                    icon={<SearchOutlined />}
                                    type="text"
                                    className="text-gray-500 hover:bg-gray-100"
                                    onClick={onToggleSearch}
                                    title="Tìm kiếm tin nhắn"
                              />
                              <Button
                                    icon={<LayoutOutlined className="rotate-180" />}
                                    type="text"
                                    className="text-gray-500 hover:bg-gray-100"
                                    onClick={onToggleInfo}
                                    title="Thông tin hội thoại"
                              />
                              {moreMenuItems.length > 0 && (
                                    <Dropdown menu={{ items: moreMenuItems }} trigger={['click']} placement="bottomRight">
                                          <Button
                                                icon={<MoreOutlined />}
                                                type="text"
                                                className="text-gray-500 hover:bg-gray-100"
                                                title="Thêm tuỳ chọn"
                                          />
                                    </Dropdown>
                              )}
                        </div>
                  </div>

                  {isDirect && otherUserId && (
                        <AliasEditModal
                              open={aliasModalOpen}
                              contactUserId={otherUserId}
                              contactDisplayName={conversationName}
                              currentAlias={contactInfo?.aliasName ?? null}
                              onClose={() => setAliasModalOpen(false)}
                        />
                  )}
            </>
      );
}