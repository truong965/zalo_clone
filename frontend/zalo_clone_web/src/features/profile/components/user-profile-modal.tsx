// src/features/users/components/user-profile-modal.tsx
import { Modal, Button } from 'antd';
import { ArrowLeftOutlined, CloseOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { UserInfoView } from './user-info-view';
import { UserEditForm } from './user-edit-form';
import { useAuthStore } from '@/features/auth/stores/auth.store'; //

interface UserProfileModalProps {
      open: boolean;
      onClose: () => void;
}

export function UserProfileModal({ open, onClose }: UserProfileModalProps) {
      const { user } = useAuthStore();
      const [isEditing, setIsEditing] = useState(false);
      const [loading, setLoading] = useState(false);

      // Reset về view mode mỗi khi mở modal lại
      useEffect(() => {
            if (open) setIsEditing(false);
      }, [open]);

      if (!user) return null;

      // Xử lý update profile (Giả lập)
      const handleUpdateProfile = async (values: any) => {
            try {
                  setLoading(true);
                  console.log('Update payload:', values);
                  // await authService.updateProfile(values); // TODO: Implement API update user
                  // await getProfile(); // Refresh data store

                  // Update xong thì quay về view
                  setIsEditing(false);
            } catch (error) {
                  console.error(error);
            } finally {
                  setLoading(false);
            }
      };

      // Custom Header cho Modal để hiển thị nút Back
      const renderHeader = () => (
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                        {isEditing && (
                              <Button
                                    type="text"
                                    icon={<ArrowLeftOutlined />}
                                    onClick={() => setIsEditing(false)}
                                    className="-ml-2"
                              />
                        )}
                        <span className="font-semibold text-lg text-gray-800">
                              {isEditing ? 'Cập nhật thông tin' : 'Thông tin tài khoản'}
                        </span>
                  </div>
                  {/* Nút close mặc định của Modal sẽ hiển thị ở góc, ta có thể ẩn nó đi và dùng custom nếu muốn, 
          hoặc để Modal tự handle */}
            </div>
      );

      return (
            <Modal
                  open={open}
                  onCancel={onClose}
                  footer={null} // Tự quản lý footer trong từng component con
                  closable={true}
                  closeIcon={<CloseOutlined className="text-gray-500 text-lg mt-2" />} // Chỉnh vị trí nút X
                  title={renderHeader()} // Dùng custom header title
                  width={400} // Độ rộng giống mobile/popup chat
                  centered
                  maskClosable={false}
                  className="user-profile-modal"
                  styles={{ body: { padding: 0 } }} // Reset padding mặc định của body modal
            >
                  <div className="min-h-[450px]">
                        {isEditing ? (
                              <UserEditForm
                                    user={user}
                                    onCancel={() => setIsEditing(false)}
                                    onSave={handleUpdateProfile}
                                    loading={loading}
                              />
                        ) : (
                              <UserInfoView
                                    user={user}
                                    onEdit={() => setIsEditing(true)}

                              />
                        )}
                  </div>
            </Modal>
      );
}