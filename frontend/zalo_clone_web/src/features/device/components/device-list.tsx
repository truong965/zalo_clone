import { useState } from 'react';
import { Typography, List, Button, Popconfirm, Tag, notification, Skeleton } from 'antd';
import { MobileOutlined, DesktopOutlined, DeleteOutlined, GlobalOutlined } from '@ant-design/icons';
import { useDeviceSessions, useRevokeSession } from '../api/device.api';
import type { DeviceSession } from '@/features/auth/api/auth.service';
import { ApiError } from '@/lib/api-error';
import { useTranslation } from 'react-i18next';

const { Title, Text, Paragraph } = Typography;

export function DeviceList() {
  const { t } = useTranslation();
  const { data: devices, isLoading, error } = useDeviceSessions();
  const { mutate: revokeSession, isPending: isRevoking } = useRevokeSession();
  const [api, contextHolder] = notification.useNotification();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleRevoke = (device: DeviceSession) => {
    setRevokingId(device.deviceId);
    revokeSession(device.deviceId, {
      onSuccess: () => {
        api.success({
          message: t('device.revokeSuccess'),
          description: t('device.revokeSuccessDesc'),
          placement: 'bottomRight',
        });
        setRevokingId(null);
      },
      onError: (err) => {
        api.error({
          message: t('device.revokeError'),
          description: ApiError.from(err).message || t('device.revokeErrorDesc'),
          placement: 'bottomRight',
        });
        setRevokingId(null);
      },
    });
  };

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        {t('device.loadError')}
      </div>
    );
  }

  const getDeviceIcon = (platform: string, type: string) => {
    const pt = platform.toLowerCase();
    const isMobile = pt.includes('ios') || pt.includes('android') || pt.includes('mobile');
    if (isMobile || type === 'MOBILE') {
      return <MobileOutlined className="text-2xl text-blue-500" />;
    }
    if (pt.includes('mac') || pt.includes('win') || pt.includes('linux')) {
      return <DesktopOutlined className="text-2xl text-indigo-500" />;
    }
    return <GlobalOutlined className="text-2xl text-gray-400" />;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {contextHolder}
      <div>
        <Title level={4} className="!text-gray-900 dark:!text-white !mb-1">
          {t('device.title')}
        </Title>
        <Paragraph className="!text-gray-500 dark:!text-gray-400 !text-sm !mb-0">
          {t('device.subtitle')}
        </Paragraph>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <Skeleton active avatar paragraph={{ rows: 2 }} />
            <Skeleton active avatar paragraph={{ rows: 2 }} className="mt-4" />
          </div>
        ) : (
          <List
            className="w-full"
            itemLayout="horizontal"
            dataSource={devices}
            renderItem={(device: DeviceSession) => (
              <List.Item
                className="px-6 py-4 hover:bg-gray-50 border-b border-gray-50 last:border-b-0"
                actions={[
                  <Popconfirm
                    key="revoke"
                    title={t('device.revokeTitle')}
                    description={t('device.revokeDesc')}
                    onConfirm={() => handleRevoke(device)}
                    okText={t('device.revokeOk')}
                    cancelText={t('device.revokeCancel')}
                    okButtonProps={{ danger: true, loading: isRevoking && revokingId === device.deviceId }}
                  >
                    <Button 
                      type="text" 
                      danger 
                      icon={<DeleteOutlined />} 
                      loading={isRevoking && revokingId === device.deviceId}
                    >
                      {t('device.revokeBtn')}
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  avatar={<div className="mt-1">{getDeviceIcon(device.platform, device.loginMethod)}</div>}
                  title={
                    <div className="flex items-center gap-2">
                      <Text className="text-base font-medium">{device.deviceName}</Text>
                      {device.isOnline && (
                        <Tag color="success" className="rounded-full border-0 font-medium">
                          {t('device.online')}
                        </Tag>
                      )}
                    </div>
                  }
                  description={
                    <div className="flex flex-col gap-0.5 mt-1">
                      <Text className="text-xs text-gray-500">
                        {t('device.platform')}: <span className="font-medium">{device.platform}</span> • {t('device.loginMethod')}: {device.loginMethod === 'QR_CODE' ? t('device.qrCode') : t('device.password')}
                      </Text>
                      <Text className="text-xs text-gray-400">
                        {t('device.ip')}: {device.ipAddress} • {t('device.loginAt')}: {formatDate(device.lastUsedAt)}
                      </Text>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  );
}
