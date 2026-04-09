import { useState } from 'react';
import {
  Typography,
  List,
  Button,
  Popconfirm,
  Tag,
  notification,
  Skeleton,
  Modal,
  Tooltip,
  Divider
} from 'antd';
import {
  MobileOutlined,
  DesktopOutlined,
  LogoutOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import { useDeviceSessions, useRevokeSession } from '../api/device.api';
import type { DeviceSession } from '@/features/auth/api/auth.service';
import { ApiError } from '@/lib/api-error';
import { useTranslation } from 'react-i18next';

const { Title, Text, Paragraph } = Typography;

export function DeviceList() {
  const { t } = useTranslation();
  const { data: sessionsData, isLoading, error } = useDeviceSessions();
  const { mutate: revokeSession, isPending: isRevoking } = useRevokeSession();
  const [api, contextHolder] = notification.useNotification();

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [detailDevice, setDetailDevice] = useState<DeviceSession | null>(null);

  const devices = sessionsData?.sessions ?? [];
  const currentDeviceId = sessionsData?.currentDeviceId;

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
        if (device.deviceId === currentDeviceId) {
          window.location.reload();
        }
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

  const getDeviceIcon = (device: DeviceSession) => {
    const platform = device.platform?.toLowerCase() || '';
    const type = device.deviceType;

    let icon = <GlobalOutlined className="text-2xl text-emerald-500/90" />;
    let bgClass = "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100/30 dark:border-emerald-800/20";

    if (type === 'MOBILE' || platform.includes('ios') || platform.includes('android')) {
      icon = <MobileOutlined className="text-2xl text-blue-500/90" />;
      bgClass = "bg-blue-50/80 dark:bg-blue-900/30 border-blue-100/30 dark:border-blue-800/20";
    } else if (type === 'DESKTOP' || platform.includes('win') || platform.includes('mac')) {
      icon = <DesktopOutlined className="text-2xl text-zinc-600 dark:text-zinc-400" />;
      bgClass = "bg-zinc-100/80 dark:bg-zinc-800/30 border-zinc-200/30 dark:border-zinc-700/20";
    }

    return (
      <div className={`flex items-center justify-center w-14 h-14 rounded-2xl border shadow-sm ${bgClass}`}>
        {icon}
      </div>
    );
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t('common.unknown');
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return t('common.unknown');

      return date.toLocaleString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return t('common.unknown');
    }
  };

  if (error) {
    return (
      <div className="p-12 text-center bg-red-50/10 dark:bg-red-900/5 rounded-[2rem] border border-red-100/20 dark:border-red-900/10">
        <WarningOutlined className="text-5xl text-red-400 mb-4" />
        <Paragraph className="text-red-600 font-semibold text-lg">{t('device.loadError')}</Paragraph>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-6">
      {contextHolder}
      <div className="px-4">
        <Title level={2} className="!text-zinc-900 dark:!text-white !mb-2 !text-2xl font-bold tracking-tight">
          {t('device.title')}
        </Title>
        <Paragraph className="!text-zinc-500 dark:!text-zinc-400 !text-base !mb-0 font-normal">
          {t('device.subtitle')}
        </Paragraph>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm rounded-3xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-6">
            <Skeleton active avatar paragraph={{ rows: 2 }} className="opacity-30" />
            <Skeleton active avatar paragraph={{ rows: 2 }} className="opacity-30" />
          </div>
        ) : (
          <List
            className="device-management-list w-full"
            itemLayout="horizontal"
            dataSource={devices}
            renderItem={(device: DeviceSession) => {
              const isCurrent = device.deviceId === currentDeviceId;
              const osInfo = [device.osName, device.osVersion].filter(Boolean).join(' ');
              const browserInfo = [device.browserName, device.browserVersion].filter(Boolean).join(' ');

              return (
                <List.Item
                  className={`pl-10 pr-6 py-6 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 relative ${isCurrent ? 'bg-indigo-50/5 dark:bg-indigo-950/5' : ''
                    }`}
                  actions={[
                    <div className="flex items-center gap-3" key="actions">
                      <Tooltip title={t('device.detailsTitle')}>
                        <Button
                          type="text"
                          shape="circle"
                          icon={<InfoCircleOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailDevice(device);
                          }}
                          className="w-10 h-10 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        />
                      </Tooltip>
                      <Popconfirm
                        title={t('device.revokeTitle')}
                        description={isCurrent ? t('device.revokeCurrentWarning') : t('device.revokeDesc')}
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          handleRevoke(device);
                        }}
                        onCancel={(e) => e?.stopPropagation()}
                        okText={t('device.revokeOk')}
                        cancelText={t('device.revokeCancel')}
                        okButtonProps={{
                          danger: true,
                          loading: isRevoking && revokingId === device.deviceId,
                        }}
                      >
                        <Button
                          type="text"
                          danger
                          shape="circle"
                          icon={<LogoutOutlined />}
                          loading={isRevoking && revokingId === device.deviceId}
                          onClick={(e) => e.stopPropagation()}
                          className="w-10 h-10"
                        />
                      </Popconfirm>
                    </div>
                  ]}
                >
                  {isCurrent && (
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
                  )}
                  <List.Item.Meta
                    className="items-center"
                    avatar={
                      <div className="w-14 flex justify-center">
                        {getDeviceIcon(device)}
                      </div>
                    }
                    title={
                      <div className="flex items-center gap-3 flex-wrap mb-1">
                        <Text className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                          {device.deviceName}
                        </Text>
                        <div className="flex items-center gap-2">
                          {isCurrent && (
                            <Tag color="indigo" className="m-0 rounded-full border-0 px-3 py-0.5 font-bold text-[10px] uppercase tracking-wider bg-indigo-500 text-white">
                              {t('device.currentDevice')}
                            </Tag>
                          )}
                          {device.isOnline ? (
                            <span className="flex items-center gap-1.5 px-3 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-100 dark:border-emerald-800/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              {t('device.online')}
                            </span>
                          ) : (
                            <span className="px-3 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-full text-[10px] font-bold uppercase tracking-wider border border-zinc-200 dark:border-zinc-700/50">
                              {t('device.offline')}
                            </span>
                          )}
                        </div>
                      </div>
                    }
                    description={
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-2 text-zinc-400 text-sm">
                          <span className="capitalize">{osInfo || device.platform || t('common.unknown')}</span>
                          {browserInfo && (
                            <>
                              <span className="opacity-30">•</span>
                              <span className="flex items-center gap-1.5">
                                <GlobalOutlined className="text-xs" />
                                {browserInfo}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex pt-1">
                          <span className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-1.5 rounded-xl text-[12px] font-medium text-zinc-500 dark:text-zinc-400 border border-zinc-100 dark:border-zinc-700/50">
                            <EnvironmentOutlined className="text-xs text-indigo-400" />
                            {device.lastLocation || device.ipAddress || device.lastIp || t('common.unknown')}
                          </span>
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </div>

      <Modal
        title={
          <div className="flex items-center gap-3">
            <InfoCircleOutlined className="text-indigo-500" />
            <span className="font-bold text-lg">{t('device.detailsTitle')}</span>
          </div>
        }
        open={!!detailDevice}
        onCancel={() => setDetailDevice(null)}
        footer={null}
        width={500}
        centered
        className="simple-device-modal"
      >
        {detailDevice && (
          <div className="space-y-6 pt-4">
            <div className="flex items-center gap-4 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl">
              {getDeviceIcon(detailDevice)}
              <div>
                <Title level={4} className="!mb-0 !font-bold">{detailDevice.deviceName}</Title>
                <Text className="text-zinc-400 text-sm uppercase font-bold tracking-wider">{detailDevice.deviceType}</Text>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <Text className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">{t('device.platform')}</Text>
                  <Text className="font-bold text-sm">{detailDevice.platform}</Text>
                </div>
                <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <Text className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">{t('device.os')}</Text>
                  <Text className="font-bold text-sm">{detailDevice.osName || t('common.unknown')}</Text>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <Text className="block text-[10px] font-bold text-zinc-400 uppercase mb-2">{t('device.activityInfo')}</Text>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Text className="text-xs text-zinc-500">{t('device.lastActive')}</Text>
                    <Text className="text-xs font-bold">{formatDate(detailDevice.lastActiveAt)}</Text>
                  </div>
                  <div className="flex justify-between items-center">
                    <Text className="text-xs text-zinc-500">{t('device.ip')}</Text>
                    <Text className="text-xs font-mono font-bold text-indigo-500">{detailDevice.ipAddress || detailDevice.lastIp}</Text>
                  </div>
                  <div className="flex justify-between items-center">
                    <Text className="text-xs text-zinc-500">Location</Text>
                    <Text className="text-xs font-bold">{detailDevice.lastLocation || t('common.unknown')}</Text>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-zinc-400 uppercase text-[10px] font-bold">
                    <HistoryOutlined /> {t('device.loginMethod')}
                  </div>
                  <Tag className="m-0 rounded-lg font-bold border-0 bg-white dark:bg-zinc-800 text-[10px] uppercase">
                    {detailDevice.loginMethod === 'QR_CODE' ? t('device.qrCode') : t('device.password')}
                  </Tag>
                </div>
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <Button
                block
                size="large"
                onClick={() => setDetailDevice(null)}
                className="rounded-xl font-bold bg-white dark:bg-zinc-900"
              >
                {t('profile.formCancel')}
              </Button>
              <Popconfirm
                title={t('device.revokeTitle')}
                description={detailDevice.deviceId === currentDeviceId ? t('device.revokeCurrentWarning') : t('device.revokeDesc')}
                onConfirm={() => handleRevoke(detailDevice)}
                okText={t('device.revokeOk')}
                cancelText={t('device.revokeCancel')}
                okButtonProps={{ danger: true, loading: isRevoking && revokingId === detailDevice.deviceId }}
              >
                <Button
                  danger
                  block
                  type="primary"
                  size="large"
                  className="rounded-xl font-bold"
                >
                  {detailDevice.deviceId === currentDeviceId ? t('common.logout') : t('device.revokeBtn')}
                </Button>
              </Popconfirm>
            </div>
          </div>
        )}
      </Modal>

      <style>{`
        .device-management-list .ant-list-item-meta {
          align-items: center !important;
        }
        
        /* Modal styling */
        .simple-device-modal .ant-modal-content {
          border-radius: 1.5rem !important;
          padding: 24px !important;
        }
        
        .simple-device-modal .ant-modal-close {
          top: 20px !important;
          right: 20px !important;
        }

        .dark .simple-device-modal .ant-modal-content {
          background-color: #121214 !important;
        }

        /* Ensure fixed width for avatar container for consistent alignment */
        .device-management-list .ant-list-item-meta-avatar {
          margin-inline: 12px !important;
          display: flex;
          justify-content: flex-start;
          width: 56px;
        }
      `}</style>
    </div>
  );
}
