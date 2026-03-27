// src/features/users/components/user-profile-modal.tsx
import { Modal, Button, notification } from 'antd';
import { ArrowLeftOutlined, CloseOutlined } from '@ant-design/icons';
import { useState, useEffect, useRef, useCallback } from 'react';
import { UserInfoView } from './user-info-view';
import { UserEditForm } from './user-edit-form';
import { useAuthStore } from '@/features/auth';
import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/constants/api-endpoints';
import { useTranslation } from 'react-i18next';

interface UserProfileModalProps {
      open: boolean;
      onClose: () => void;
}

async function uploadAvatarFile(file: File, options?: { targetId?: string; targetType?: 'USER' | 'GROUP' }): Promise<string> {
      const { data: initRes } = await apiClient.post(API_ENDPOINTS.MEDIA.UPLOAD_AVATAR, {
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            targetId: options?.targetId,
            targetType: options?.targetType,
      });

      const { presignedUrl, fileUrl } = initRes.data;

      const uploadRes = await fetch(presignedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
      });

      if (!uploadRes.ok) {
            throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      return fileUrl;
}

export function UserProfileModal({ open, onClose }: UserProfileModalProps) {
      const { user, getProfile } = useAuthStore();
      const { t } = useTranslation();
      const [isEditing, setIsEditing] = useState(false);
      const [loading, setLoading] = useState(false);
      const avatarInputRef = useRef<HTMLInputElement>(null);

      // Reset về view mode mỗi khi mở modal lại
      useEffect(() => {
            if (open) setIsEditing(false);
      }, [open]);

      const patchProfile = useCallback(async (data: Record<string, unknown>) => {
            if (!user) return;
            await apiClient.patch(API_ENDPOINTS.USERS.GET_BY_ID(user.id), data);
            await getProfile();
      }, [user, getProfile]);

      // Xử lý update profile
      const handleUpdateProfile = async (values: Record<string, unknown>) => {
            try {
                  setLoading(true);
                  await patchProfile(values);
                  notification.success({ message: t('profile.updateSuccess') });
                  setIsEditing(false);
            } catch {
                  notification.error({ message: t('profile.updateFail') });
            } finally {
                  setLoading(false);
            }
      };

      // Avatar upload
      const handleAvatarClick = useCallback(() => {
            avatarInputRef.current?.click();
      }, []);

      const handleAvatarFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            // Reset input value so same file can be re-selected
            e.target.value = '';

            try {
                  setLoading(true);
                  if (!user) return;
                  await uploadAvatarFile(file, {
                        targetId: user.id,
                        targetType: 'USER',
                  });
                  // Backend now updates the DB via event on upload initiation
                  // We just need to refresh the local profile state
                  await getProfile();
                  notification.success({ message: t('profile.avatarSuccess') });
            } catch {
                  notification.error({ message: t('profile.avatarFail') });
            } finally {
                  setLoading(false);
            }
      }, [user, getProfile, t]);

      if (!user) return null;

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
                        {isEditing ? t('profile.modalEditTitle') : t('profile.modalViewTitle')}
                  </span>
                  </div>
            </div>
      );

      return (
            <Modal
                  open={open}
                  onCancel={onClose}
                  footer={null}
                  closable={true}
                  closeIcon={<CloseOutlined className="text-gray-500 text-lg mt-2" />}
                  title={renderHeader()}
                  width={400}
                  centered
                  maskClosable={false}
                  className="user-profile-modal"
                  styles={{ body: { padding: 0 } }}
            >
                  {/* Hidden file input for avatar upload */}
                  <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => void handleAvatarFileChange(e)}
                  />

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
                                    onAvatarChange={handleAvatarClick}
                              />
                        )}
                  </div>
            </Modal>
      );
}