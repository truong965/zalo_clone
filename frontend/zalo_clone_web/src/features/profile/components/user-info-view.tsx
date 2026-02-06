// src/features/users/components/user-info-view.tsx
import { Avatar, Button, Typography, Divider } from 'antd';
import {
      UserOutlined,
      EditOutlined,
      ManOutlined,
      WomanOutlined,
      PhoneOutlined,
      CalendarOutlined,
      CameraOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { User } from '@/types/api'; //
import { Gender } from '@/types/api';

const { Title } = Typography;

interface UserInfoViewProps {
      user: User;
      onEdit: () => void;
}

export function UserInfoView({ user, onEdit }: UserInfoViewProps) {

      // Helper render giới tính
      const renderGender = (gender?: Gender) => {
            if (gender === Gender.MALE) return <><ManOutlined className="mr-2 text-blue-500" />Nam</>;
            if (gender === Gender.FEMALE) return <><WomanOutlined className="mr-2 text-pink-500" />Nữ</>;
            return <><UserOutlined className="mr-2" />Khác</>;
      };

      return (
            <div className="flex flex-col h-full">
                  {/* 1. Header & Avatar */}
                  <div className="relative flex flex-col items-center pt-6 pb-2">
                        {/* Wrapper cần là inline-block hoặc relative để nút absolute căn theo nó */}
                        <div className="relative group cursor-pointer">
                              <Avatar
                                    size={100}
                                    src={user.avatarUrl}
                                    icon={<UserOutlined />}
                                    className="bg-blue-100 text-blue-600 border-4 border-white shadow-md select-none object-cover"
                              />

                              {/* [UPDATE]: Nút Camera giống ảnh 1 */}
                              <div
                                    className="absolute bottom-0 right-0 flex items-center justify-center bg-[#F0F2F5] hover:bg-gray-200 rounded-full border-[3px] border-white shadow-sm cursor-pointer transition-colors"
                                    style={{ width: 36, height: 36 }} // Set size cố định cho tròn đẹp
                                    onClick={() => {
                                          // TODO: Xử lý sự kiện upload avatar tại đây
                                          console.log("Upload avatar clicked");
                                    }}
                              >
                                    <CameraOutlined className="text-gray-600 text-lg" />
                              </div>
                        </div>

                        <Title level={3} className="mt-3 mb-0 text-gray-800 font-bold">{user.displayName}</Title>
                  </div>

                  <Divider className="!my-0 !border-t-4" />

                  {/* 2. Thông tin chi tiết */}
                  <div className="flex-1 px-4 py-6 space-y-6">
                        <Title level={5} className="text-gray-700">Thông tin cá nhân</Title>

                        <div className="space-y-4 text-base">
                              <div className="flex items-center text-gray-600">
                                    <span className="w-24 text-gray-500 font-medium">Giới tính:</span>
                                    <span className="text-gray-900 font-medium flex items-center">
                                          {renderGender(user.gender)}
                                    </span>
                              </div>

                              <div className="flex items-center text-gray-600">
                                    <span className="w-24 text-gray-500 font-medium">Ngày sinh:</span>
                                    <span className="text-gray-900 font-medium flex items-center">
                                          <CalendarOutlined className="mr-2 text-gray-400" />
                                          {user.dateOfBirth ? dayjs(user.dateOfBirth).format('DD/MM/YYYY') : 'Chưa cập nhật'}
                                    </span>
                              </div>

                              <div className="flex items-center text-gray-600">
                                    <span className="w-24 text-gray-500 font-medium">Điện thoại:</span>
                                    <span className="text-gray-900 font-medium flex items-center">
                                          <PhoneOutlined className="mr-2 text-gray-400" />
                                          {user.phoneNumber}
                                    </span>
                              </div>
                        </div>

                        <div className="mt-4 text-sm text-gray-500 italic">
                              Chỉ bạn bè có lưu số của bạn trong danh bạ máy xem được số này.
                        </div>
                  </div>

                  {/* 3. Footer Button */}
                  <div className="border-t border-gray-100">
                        <Button
                              type="text"
                              block
                              icon={<EditOutlined />}
                              className="bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 font-medium h-10 rounded-lg"
                              onClick={onEdit}
                        >
                              Cập nhật
                        </Button>
                  </div>
            </div>
      );
}