import { Avatar, Button, Typography, Collapse, Switch } from 'antd';
import {
      EditOutlined,
      RightOutlined,
      ClockCircleOutlined,
      WarningOutlined,
      DeleteOutlined,
      EyeInvisibleOutlined,
      BellOutlined,
      PushpinOutlined,
      UsergroupAddOutlined,
} from '@ant-design/icons';

const { Title } = Typography;

interface ChatInfoSidebarProps {
      onClose: () => void;
}

export function ChatInfoSidebar({ onClose: _onClose }: ChatInfoSidebarProps) {
      // _onClose handler available for close button if needed

      // Các section trong Collapse
      const items = [
            {
                  key: '1',
                  label: <span className="font-medium">Ảnh/Video</span>,
                  children: <div className="text-gray-500 text-center py-2 text-xs">Chưa có Ảnh/Video được chia sẻ</div>,
            },
            {
                  key: '2',
                  label: <span className="font-medium">File</span>,
                  children: <div className="text-gray-500 text-center py-2 text-xs">Chưa có File được chia sẻ</div>,
            },
            {
                  key: '3',
                  label: <span className="font-medium">Link</span>,
                  children: <div className="text-gray-500 text-center py-2 text-xs">Chưa có Link được chia sẻ</div>,
            },
            {
                  key: '4',
                  label: <span className="font-medium">Thiết lập bảo mật</span>,
                  children: (
                        <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-1 rounded">
                                    <ClockCircleOutlined className="text-gray-500" />
                                    <div className="flex-1">
                                          <div className="text-sm">Tin nhắn tự xóa</div>
                                          <div className="text-xs text-gray-400">Không bao giờ</div>
                                    </div>
                              </div>
                              <div className="flex items-center justify-between p-1">
                                    <div className="flex items-center gap-3">
                                          <EyeInvisibleOutlined className="text-gray-500" />
                                          <span className="text-sm">Ẩn trò chuyện</span>
                                    </div>
                                    <Switch size="small" />
                              </div>
                        </div>
                  )
            }
      ];

      return (
            <div className="w-[340px] h-full border-l border-gray-200 bg-white flex flex-col overflow-y-auto">
                  {/* Header */}
                  <div className="flex-none h-14 flex items-center justify-center border-b border-gray-100">
                        <Title level={5} className="m-0 text-gray-700">Thông tin hội thoại</Title>
                  </div>

                  {/* Profile Section */}
                  <div className="flex-none flex flex-col items-center py-6 bg-white border-b border-gray-100 border-[6px] border-b-[#f4f5f7]">
                        {/* ... (giữ nguyên) */}
                        <Avatar size={64} src="https://i.pravatar.cc/150?img=2" className="mb-3 border border-gray-200" />
                        <div className="flex items-center gap-2 mb-4">
                              <Title level={4} className="m-0">Khổng Tám</Title>
                              <Button type="text" size="small" icon={<EditOutlined className="text-gray-400" />} />
                        </div>

                        {/* 3 Quick Actions */}
                        <div className="flex gap-8 justify-center w-full px-4">
                              <div className="flex flex-col items-center gap-2 cursor-pointer group">
                                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                                          <BellOutlined className="text-gray-600 group-hover:text-blue-600" />
                                    </div>
                                    <span className="text-xs text-gray-500 text-center max-w-[60px]">Tắt thông báo</span>
                              </div>
                              <div className="flex flex-col items-center gap-2 cursor-pointer group">
                                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                                          <PushpinOutlined className="text-gray-600 group-hover:text-blue-600" />
                                    </div>
                                    <span className="text-xs text-gray-500 text-center max-w-[60px]">Ghim hội thoại</span>
                              </div>
                              <div className="flex flex-col items-center gap-2 cursor-pointer group">
                                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                                          <UsergroupAddOutlined className="text-gray-600 group-hover:text-blue-600" />
                                    </div>
                                    <span className="text-xs text-gray-500 text-center max-w-[60px]">Tạo nhóm</span>
                              </div>
                        </div>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto">
                        <div className="p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 border-b border-[#f4f5f7] border-b-[6px]">
                              <ClockCircleOutlined className="text-gray-500 text-lg" />
                              <span className="text-sm font-medium text-gray-600">Danh sách nhắc hẹn</span>
                        </div>

                        <Collapse
                              ghost
                              expandIconPosition="end"
                              expandIcon={({ isActive }) => <RightOutlined rotate={isActive ? 90 : 0} className="text-xs text-gray-400" />}
                              items={items}
                              className="site-collapse-custom-collapse"
                        />

                        <div className="border-t border-[#f4f5f7] border-t-[6px] p-2">
                              <Button type="text" danger block className="text-left flex items-center gap-2 h-10" icon={<WarningOutlined />}>
                                    Báo xấu
                              </Button>
                              <Button type="text" danger block className="text-left flex items-center gap-2 h-10" icon={<DeleteOutlined />}>
                                    Xóa lịch sử trò chuyện
                              </Button>
                        </div>
                  </div>
            </div>
      )
}