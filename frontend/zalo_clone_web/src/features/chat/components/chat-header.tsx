import { Avatar, Button, Typography } from 'antd';
import {
      SearchOutlined,
      UsergroupAddOutlined,
      VideoCameraOutlined,
      LayoutOutlined,
} from '@ant-design/icons';

const { Title } = Typography;

interface ChatHeaderProps {
      conversationName: string;
      onToggleSearch: () => void;
      onToggleInfo: () => void;
}

export function ChatHeader({ conversationName, onToggleSearch, onToggleInfo }: ChatHeaderProps) {
      return (
            <div className="h-16 px-4 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm z-10 flex-none">
                  <div className="flex items-center gap-3">
                        <Avatar size="large" src="https://i.pravatar.cc/150?img=2" className="bg-blue-500">K</Avatar>
                        <div>
                              <Title level={5} className="mb-0 text-gray-800">{conversationName}</Title>
                              <div className="flex items-center text-xs text-gray-500">
                                    <span className="w-2 h-2 bg-green-500 rounded-full mr-1.5"></span>
                                    Truy cập vừa xong
                              </div>
                        </div>
                  </div>

                  <div className="flex gap-1">
                        <Button
                              icon={<UsergroupAddOutlined />}
                              type="text"
                              className="text-gray-500 hover:bg-gray-100"
                              title="Thêm thành viên"
                        />
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
                  </div>
            </div>
      );
}