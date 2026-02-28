/**
 * Admin Activity Page — Anomaly Detection
 *
 * 4 tabs: Suspended, Inactive, High Activity, Multi-Device
 * Each tab renders its own table with data from dedicated hooks.
 *
 * Skills applied:
 * - architecture-compound-components (each tab is a separate component)
 * - rendering-conditional-render (ternary)
 * - rerender-functional-setstate (updaters for threshold)
 * - patterns-explicit-variants (status tag map)
 */

import { useState, useCallback } from 'react';
import {
      Tabs,
      Table,
      Button,
      Tag,
      Popconfirm,
      InputNumber,
      Space,
      message,
      Skeleton,
      Card,
} from 'antd';
import {
      CheckCircleOutlined,
      LogoutOutlined,
      StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
      useActivitySuspended,
      useActivityInactive,
      useActivityHighActivity,
      useActivityMultiDevice,
      useActivateUser,
      useSuspendUser,
      useForceLogoutUser,
} from '@/features/admin';
import type {
      SuspendedUser,
      InactiveUser,
      HighActivityUser,
      MultiDeviceUser,
} from '@/features/admin';

// ============================================================================
// Tab 1: Suspended Users
// ============================================================================

function SuspendedTab() {
      const { data, isLoading } = useActivitySuspended();
      const activateMutation = useActivateUser();

      const handleActivate = useCallback(
            (id: string) => {
                  activateMutation.mutate(id, {
                        onSuccess: () => void message.success('User activated'),
                        onError: () => void message.error('Failed to activate user'),
                  });
            },
            [activateMutation],
      );

      const columns: ColumnsType<SuspendedUser> = [
            { title: 'Name', dataIndex: 'displayName', key: 'displayName' },
            { title: 'Phone', dataIndex: 'phoneNumber', key: 'phoneNumber' },
            {
                  title: 'Suspended At',
                  dataIndex: 'updatedAt',
                  key: 'updatedAt',
                  render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
            },
            {
                  title: 'Action',
                  key: 'action',
                  width: 120,
                  render: (_: unknown, record: SuspendedUser) => (
                        <Popconfirm title="Activate this user?" onConfirm={() => handleActivate(record.id)} okText="Activate">
                              <Button icon={<CheckCircleOutlined />} size="small" loading={activateMutation.isPending}>
                                    Activate
                              </Button>
                        </Popconfirm>
                  ),
            },
      ];

      return isLoading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
            <Table dataSource={data ?? []} columns={columns} rowKey="id" pagination={{ pageSize: 10 }} />
      );
}

// ============================================================================
// Tab 2: Inactive Users
// ============================================================================

function InactiveTab() {
      const [days, setDays] = useState(30);
      const { data, isLoading } = useActivityInactive(days);

      const columns: ColumnsType<InactiveUser> = [
            { title: 'Name', dataIndex: 'displayName', key: 'displayName' },
            { title: 'Phone', dataIndex: 'phoneNumber', key: 'phoneNumber' },
            {
                  title: 'Last Seen',
                  dataIndex: 'lastSeenAt',
                  key: 'lastSeenAt',
                  render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : 'Never'),
            },
            {
                  title: 'Days Inactive',
                  key: 'daysInactive',
                  render: (_: unknown, r: InactiveUser) => {
                        const ref = r.lastSeenAt ? dayjs(r.lastSeenAt) : dayjs(r.createdAt);
                        return dayjs().diff(ref, 'day');
                  },
            },
            {
                  title: 'Joined',
                  dataIndex: 'createdAt',
                  key: 'createdAt',
                  render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
            },
      ];

      return (
            <div className="space-y-4">
                  <Space>
                        <span>Inactive for at least</span>
                        <InputNumber min={1} max={365} value={days} onChange={(v) => setDays(v ?? 30)} />
                        <span>days</span>
                  </Space>
                  {isLoading ? (
                        <Skeleton active paragraph={{ rows: 6 }} />
                  ) : (
                        <Table dataSource={data ?? []} columns={columns} rowKey="id" pagination={{ pageSize: 10 }} />
                  )}
            </div>
      );
}

// ============================================================================
// Tab 3: High Activity Users
// ============================================================================

function HighActivityTab() {
      const [hours, setHours] = useState(24);
      const [threshold, setThreshold] = useState(500);
      const { data, isLoading } = useActivityHighActivity({ hours, threshold });
      const suspendMutation = useSuspendUser();

      const handleSuspend = useCallback(
            (id: string) => {
                  suspendMutation.mutate(id, {
                        onSuccess: () => void message.success('User suspended'),
                        onError: () => void message.error('Failed to suspend user'),
                  });
            },
            [suspendMutation],
      );

      const columns: ColumnsType<HighActivityUser> = [
            { title: 'Name', key: 'name', render: (_: unknown, r: HighActivityUser) => r.user.displayName },
            { title: 'Phone', key: 'phone', render: (_: unknown, r: HighActivityUser) => r.user.phoneNumber },
            { title: 'Messages', dataIndex: 'messageCount', key: 'messageCount' },
            {
                  title: 'Window',
                  key: 'window',
                  render: (_: unknown, r: HighActivityUser) => `${r.windowHours}h`,
            },
            {
                  title: 'Status',
                  key: 'status',
                  render: (_: unknown, r: HighActivityUser) => (
                        <Tag color={r.user.status === 'SUSPENDED' ? 'red' : 'green'}>{r.user.status}</Tag>
                  ),
            },
            {
                  title: 'Action',
                  key: 'action',
                  width: 120,
                  render: (_: unknown, r: HighActivityUser) =>
                        r.user.status !== 'SUSPENDED' ? (
                              <Popconfirm
                                    title="Suspend this user?"
                                    description="All sessions will be revoked."
                                    onConfirm={() => handleSuspend(r.user.id)}
                                    okText="Suspend"
                                    okButtonProps={{ danger: true }}
                              >
                                    <Button danger icon={<StopOutlined />} size="small" loading={suspendMutation.isPending}>
                                          Suspend
                                    </Button>
                              </Popconfirm>
                        ) : (
                              <Tag color="red">Suspended</Tag>
                        ),
            },
      ];

      return (
            <div className="space-y-4">
                  <Space>
                        <span>In the last</span>
                        <InputNumber min={1} max={168} value={hours} onChange={(v) => setHours(v ?? 24)} />
                        <span>hours, threshold</span>
                        <InputNumber min={1} max={100000} value={threshold} onChange={(v) => setThreshold(v ?? 500)} />
                        <span>messages</span>
                  </Space>
                  {isLoading ? (
                        <Skeleton active paragraph={{ rows: 6 }} />
                  ) : (
                        <Table
                              dataSource={data ?? []}
                              columns={columns}
                              rowKey={(r) => r.user.id}
                              pagination={{ pageSize: 10 }}
                        />
                  )}
            </div>
      );
}

// ============================================================================
// Tab 4: Multi-Device Users
// ============================================================================

function MultiDeviceTab() {
      const [minSessions, setMinSessions] = useState(3);
      const { data, isLoading } = useActivityMultiDevice({ minSessions });
      const forceLogoutMutation = useForceLogoutUser();

      const handleForceLogout = useCallback(
            (id: string) => {
                  forceLogoutMutation.mutate(id, {
                        onSuccess: () => void message.success('All sessions terminated'),
                        onError: () => void message.error('Failed to force logout'),
                  });
            },
            [forceLogoutMutation],
      );

      const columns: ColumnsType<MultiDeviceUser> = [
            { title: 'Name', key: 'name', render: (_: unknown, r: MultiDeviceUser) => r.user.displayName },
            { title: 'Phone', key: 'phone', render: (_: unknown, r: MultiDeviceUser) => r.user.phoneNumber },
            { title: 'Sessions', dataIndex: 'sessionCount', key: 'sessionCount', width: 100 },
            {
                  title: 'Action',
                  key: 'action',
                  width: 160,
                  render: (_: unknown, r: MultiDeviceUser) => (
                        <Popconfirm
                              title="Force logout all sessions?"
                              description="All active sessions will be terminated."
                              onConfirm={() => handleForceLogout(r.user.id)}
                              okText="Force Logout"
                              okButtonProps={{ danger: true }}
                        >
                              <Button danger icon={<LogoutOutlined />} size="small" loading={forceLogoutMutation.isPending}>
                                    Force Logout All
                              </Button>
                        </Popconfirm>
                  ),
            },
      ];

      const sessionColumns = [
            { title: 'Device', dataIndex: 'deviceName', key: 'deviceName', render: (v: string | null) => v ?? '—' },
            { title: 'Platform', dataIndex: 'platform', key: 'platform', render: (v: string | null) => v ?? '—' },
            { title: 'IP', dataIndex: 'ipAddress', key: 'ipAddress', render: (v: string | null) => v ?? '—' },
            {
                  title: 'Last Used',
                  dataIndex: 'lastUsedAt',
                  key: 'lastUsedAt',
                  render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
            },
      ];

      return (
            <div className="space-y-4">
                  <Space>
                        <span>Min sessions:</span>
                        <InputNumber min={2} max={50} value={minSessions} onChange={(v) => setMinSessions(v ?? 3)} />
                  </Space>
                  {isLoading ? (
                        <Skeleton active paragraph={{ rows: 6 }} />
                  ) : (
                        <Table
                              dataSource={data ?? []}
                              columns={columns}
                              rowKey={(r) => r.user.id}
                              pagination={{ pageSize: 10 }}
                              expandable={{
                                    expandedRowRender: (record) => (
                                          <Table
                                                dataSource={record.sessions}
                                                columns={sessionColumns}
                                                rowKey="deviceId"
                                                size="small"
                                                pagination={false}
                                          />
                                    ),
                              }}
                        />
                  )}
            </div>
      );
}

// ============================================================================
// Main Activity Page
// ============================================================================

export function AdminActivityPage() {
      return (
            <div className="space-y-6">
                  <h1 className="text-2xl font-bold">Activity Monitor</h1>

                  <Card>
                        <Tabs
                              defaultActiveKey="suspended"
                              items={[
                                    { key: 'suspended', label: 'Suspended Users', children: <SuspendedTab /> },
                                    { key: 'inactive', label: 'Inactive Users', children: <InactiveTab /> },
                                    { key: 'high-activity', label: 'High Activity', children: <HighActivityTab /> },
                                    { key: 'multi-device', label: 'Multi-Device', children: <MultiDeviceTab /> },
                              ]}
                        />
                  </Card>
            </div>
      );
}
