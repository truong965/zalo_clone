import { Button, Input, Select, Typography } from 'antd';
import { CloseOutlined, SearchOutlined, UserOutlined, CalendarOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface ChatSearchSidebarProps {
      onClose: () => void;
}

export function ChatSearchSidebar({ onClose }: ChatSearchSidebarProps) {
      return (
            <div className="w-[340px] h-full border-l border-gray-200 bg-white flex flex-col animate-slide-in-right">
                  {/* Header */}
                  <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
                        <Title level={5} className="m-0 text-gray-700">Tìm kiếm trong trò chuyện</Title>
                        <Button type="text" icon={<CloseOutlined />} onClick={onClose} />
                  </div>

                  {/* Body */}
                  <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
                        {/* Search Input */}
                        <Input
                              prefix={<SearchOutlined className="text-gray-400" />}
                              placeholder="Nhập từ khóa để tìm kiếm"
                              className="rounded-md"
                        />

                        {/* Filters */}
                        <div className="flex gap-2 items-center text-sm text-gray-500">
                              <span>Lọc theo:</span>
                              <Select
                                    defaultValue="sender"
                                    size="small"
                                    variant="borderless"
                                    className="bg-gray-100 rounded min-w-[100px]"
                                    suffixIcon={<UserOutlined />}
                                    options={[{ value: 'sender', label: 'Người gửi' }]}
                              />
                              <Select
                                    defaultValue="date"
                                    size="small"
                                    variant="borderless"
                                    className="bg-gray-100 rounded min-w-[100px]"
                                    suffixIcon={<CalendarOutlined />}
                                    options={[{ value: 'date', label: 'Ngày gửi' }]}
                              />
                        </div>

                        {/* Empty State / Result Placeholder */}
                        <div className="flex-1 flex flex-col items-center justify-center text-center mt-10">
                              {/* Icon kính lúp to (giả lập) */}
                              <div className="w-32 h-32 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                                    <SearchOutlined className="text-6xl text-blue-300" />
                              </div>
                              <Text strong className="block mb-1">Hãy nhập từ khóa để bắt đầu tìm kiếm</Text>
                              <Text type="secondary">tin nhắn và file trong trò chuyện</Text>
                        </div>
                  </div>
            </div>
      );
}