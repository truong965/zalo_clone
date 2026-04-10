import { Modal, notification, Spin } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { UserInfoView } from './user-info-view';
import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/constants/api-endpoints';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api-error';
import type { User } from '@/types/api';

interface OtherUserProfileModalProps {
      userId: string | null;
      open: boolean;
      onClose: () => void;
}

interface PublicProfileResponse {
      user: User;
      showSensitive: boolean;
}

export function OtherUserProfileModal({ userId, open, onClose }: OtherUserProfileModalProps) {
      const { t } = useTranslation();
      const [loading, setLoading] = useState(false);
      const [profileData, setProfileData] = useState<PublicProfileResponse | null>(null);

      useEffect(() => {
            if (open && userId) {
                  fetchProfile();
            } else if (!open) {
                  // Reset state when modal closes
                  setProfileData(null);
            }
      }, [open, userId]);

      const fetchProfile = async () => {
            if (!userId) return;
            try {
                  setLoading(true);
                  const response = await apiClient.get<any>(
                        API_ENDPOINTS.USERS.GET_PUBLIC_PROFILE(userId)
                  );
                  // Backend with TransformInterceptor returns { statusCode, message, data: { user, showSensitive } }
                  setProfileData(response.data.data);
            } catch (error) {
                  const apiErr = ApiError.from(error);
                  if (apiErr.status === 403) {
                        notification.error({
                              message: t('profile.viewForbidden', 'Không thể xem thông tin'),
                              description: apiErr.message || t('profile.viewForbiddenDesc', 'Bạn không có quyền xem thông tin người dùng này'),
                        });
                        onClose();
                  } else {
                        notification.error({
                              message: t('profile.fetchError', 'Lỗi tải thông tin'),
                              description: apiErr.message,
                        });
                  }
            } finally {
                  setLoading(false);
            }
      };

      return (
            <Modal
                  open={open}
                  onCancel={onClose}
                  footer={null}
                  closable={true}
                  closeIcon={<CloseOutlined className="text-gray-500 text-lg mt-2" />}
                  title={<span className="font-semibold text-lg text-gray-800">{t('profile.modalViewTitle')}</span>}
                  width={400}
                  centered
                  maskClosable={true}
                  destroyOnClose
                  styles={{ body: { padding: 0 } }}
            >
                  <div className="min-h-[450px] flex flex-col">
                        {loading ? (
                              <div className="flex-1 flex items-center justify-center">
                                    <Spin size="large" tip={t('common.loading', 'Đang tải...')} />
                              </div>
                        ) : profileData ? (
                              <UserInfoView
                                    user={profileData.user}
                                    showEdit={false}
                                    showSensitive={profileData.showSensitive}
                                    showAvatarActions={false}
                              />
                        ) : (
                              <div className="flex-1 flex items-center justify-center text-gray-400">
                                    {t('profile.noData', 'Không có dữ liệu')}
                              </div>
                        )}
                  </div>
            </Modal>
      );
}
