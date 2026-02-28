/**
 * Admin Users Page
 *
 * Server-side paginated user table with filters, detail drawer, and admin actions.
 *
 * Skills applied:
 * - architecture-compound-components (UserDetailDrawer as separate component)
 * - rendering-conditional-render (ternary, not &&)
 * - rerender-functional-setstate (updater functions for filter state)
 * - rerender-derived-state-no-effect (no useEffect for derived values)
 * - patterns-explicit-variants (status tag colors as map)
 * - js-set-map-lookups (status color map)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
      Table,
      Button,
      Space,
      Popconfirm,
      Tag,
      Input,
      Card,
      Select,
      DatePicker,
      Drawer,
      Descriptions,
      Avatar,
      Skeleton,
      Statistic,
      message,
      Row,
      Col,
} from 'antd';
import {
      SearchOutlined,
      EyeOutlined,
      StopOutlined,
      CheckCircleOutlined,
      LogoutOutlined,
      UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
      useAdminUsers,
      useAdminUserDetail,
      useSuspendUser,
      useActivateUser,
      useForceLogoutUser,
} from '@/features/admin';
import type {
      AdminUserListItem,
      AdminSession,
      UserStatus,
      UserListQuery,
} from '@/features/admin';

const { RangePicker } = DatePicker;

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS: Record<UserStatus, string> = {
      ACTIVE: 'green',
      INACTIVE: 'orange',
      SUSPENDED: 'red',
      DELETED: 'default',
};

const STATUS_OPTIONS = [
      { label: 'All', value: '' },
      { label: 'Active', value: 'ACTIVE' },
      { label: 'Suspended', value: 'SUSPENDED' },
      { label: 'Inactive', value: 'INACTIVE' },
      { label: 'Deleted', value: 'DELETED' },
];

const PLATFORM_OPTIONS = [
      { label: 'All', value: '' },
      { label: 'Web', value: 'WEB' },
      { label: 'Android', value: 'ANDROID' },
      { label: 'iOS', value: 'IOS' },
];

const DEFAULT_PAGE_SIZE = 10;

// ============================================================================
// User Detail Drawer (compound component)
// ============================================================================

interface UserDetailDrawerProps {
      userId: string | null;
      open: boolean;
      onClose: () => void;
      onSuspend: (id: string) => void;
      onActivate: (id: string) => void;
      onForceLogout: (id: string) => void;
      actionLoading: boolean;
}

const sessionColumns: ColumnsType<AdminSession> = [
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

function UserDetailDrawer({
      userId,
      open,
      onClose,
      onSuspend,
      onActivate,
      onForceLogout,
      actionLoading,
}: UserDetailDrawerProps) {
      const { data: detail, isLoading } = useAdminUserDetail(open ? userId : null);

      const profile = detail?.profile;
      const isSuspended = profile?.status === 'SUSPENDED';

      return (
            <Drawer
                  title="User Detail"
                  placement="right"
                  width={560}
                  open={open}
                  onClose={onClose}
                  extra={
                        profile ? (
                              <Space>
                                    {isSuspended ? (
                                          <Popconfirm
                                                title="Activate this user?"
                                                description="The user will be able to log in again."
                                                onConfirm={() => onActivate(profile.id)}
                                                okText="Activate"
                                          >
                                                <Button icon={<CheckCircleOutlined />} loading={actionLoading}>
                                                      Activate
                                                </Button>
                                          </Popconfirm>
                                    ) : (
                                          <Popconfirm
                                                title="Suspend this user?"
                                                description="All sessions will be revoked immediately."
                                                onConfirm={() => onSuspend(profile.id)}
                                                okText="Suspend"
                                                okButtonProps={{ danger: true }}
                                          >
                                                <Button danger icon={<StopOutlined />} loading={actionLoading}>
                                                      Suspend
                                                </Button>
                                          </Popconfirm>
                                    )}
                                    <Popconfirm
                                          title="Force logout?"
                                          description="All active sessions will be terminated."
                                          onConfirm={() => onForceLogout(profile.id)}
                                          okText="Force Logout"
                                          okButtonProps={{ danger: true }}
                                    >
                                          <Button danger icon={<LogoutOutlined />} loading={actionLoading}>
                                                Force Logout
                                          </Button>
                                    </Popconfirm>
                              </Space>
                        ) : null
                  }
            >
                  {isLoading ? (
                        <Skeleton active avatar paragraph={{ rows: 12 }} />
                  ) : detail ? (
                        <div className="space-y-6">
                              {/* Profile Section */}
                              <div className="flex items-center gap-4">
                                    <Avatar
                                          size={72}
                                          src={profile?.avatarUrl}
                                          icon={profile?.avatarUrl ? undefined : <UserOutlined />}
                                    />
                                    <div>
                                          <h3 className="text-lg font-semibold m-0">{profile?.displayName}</h3>
                                          <p className="text-gray-500 m-0">{profile?.phoneNumber}</p>
                                          <Tag color={STATUS_COLORS[profile?.status ?? 'ACTIVE']}>{profile?.status}</Tag>
                                    </div>
                              </div>

                              <Descriptions column={2} size="small" bordered>
                                    <Descriptions.Item label="Bio" span={2}>
                                          {profile?.bio ?? '—'}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Date of Birth">
                                          {profile?.dateOfBirth ? dayjs(profile.dateOfBirth).format('YYYY-MM-DD') : '—'}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Gender">{profile?.gender ?? '—'}</Descriptions.Item>
                                    <Descriptions.Item label="Role">{profile?.role?.name ?? 'USER'}</Descriptions.Item>
                                    <Descriptions.Item label="Joined">
                                          {profile?.createdAt ? dayjs(profile.createdAt).format('YYYY-MM-DD') : '—'}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Last Seen">
                                          {profile?.lastSeenAt ? dayjs(profile.lastSeenAt).format('YYYY-MM-DD HH:mm') : '—'}
                                    </Descriptions.Item>
                              </Descriptions>

                              {/* Activity Summary */}
                              <Card title="Activity Summary" size="small">
                                    <Row gutter={16}>
                                          <Col span={8}>
                                                <Statistic title="Messages" value={detail.activitySummary.messageCount} />
                                          </Col>
                                          <Col span={8}>
                                                <Statistic
                                                      title="Voice Calls"
                                                      value={detail.activitySummary.calls?.VOICE ?? 0}
                                                />
                                          </Col>
                                          <Col span={8}>
                                                <Statistic
                                                      title="Video Calls"
                                                      value={detail.activitySummary.calls?.VIDEO ?? 0}
                                                />
                                          </Col>
                                    </Row>
                              </Card>

                              {/* Active Sessions */}
                              <Card title={`Active Sessions (${detail.activeSessions.length})`} size="small">
                                    <Table
                                          dataSource={detail.activeSessions}
                                          columns={sessionColumns}
                                          rowKey="id"
                                          size="small"
                                          pagination={false}
                                    />
                              </Card>
                        </div>
                  ) : null}
            </Drawer>
      );
}

// ============================================================================
// Main Users Page
// ============================================================================

export function AdminUsersPage() {
      // Filter state
      const [search, setSearch] = useState('');
      const [status, setStatus] = useState<string>('');
      const [platform, setPlatform] = useState<string>('');
      const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
      const [page, setPage] = useState(1);
      const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

      // Drawer state
      const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
      const [drawerOpen, setDrawerOpen] = useState(false);

      // Debounce search
      const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
      const [debouncedSearch, setDebouncedSearch] = useState('');

      useEffect(() => {
            debounceTimer.current = setTimeout(() => {
                  setDebouncedSearch(search);
                  setPage(1); // Reset to page 1 on search change
            }, 300);
            return () => clearTimeout(debounceTimer.current);
      }, [search]);

      // Build query params
      const queryParams: UserListQuery = {
            page,
            limit: pageSize,
            ...(debouncedSearch ? { search: debouncedSearch } : {}),
            ...(status ? { status: status as UserStatus } : {}),
            ...(platform ? { platform } : {}),
            ...(dateRange?.[0] ? { dateFrom: dateRange[0].format('YYYY-MM-DD') } : {}),
            ...(dateRange?.[1] ? { dateTo: dateRange[1].format('YYYY-MM-DD') } : {}),
      };

      const { data, isLoading } = useAdminUsers(queryParams);
      const suspendMutation = useSuspendUser();
      const activateMutation = useActivateUser();
      const forceLogoutMutation = useForceLogoutUser();

      const actionLoading =
            suspendMutation.isPending || activateMutation.isPending || forceLogoutMutation.isPending;

      // Action handlers with feedback
      const handleSuspend = useCallback(
            (id: string) => {
                  suspendMutation.mutate(id, {
                        onSuccess: () => void message.success('User suspended'),
                        onError: () => void message.error('Failed to suspend user'),
                  });
            },
            [suspendMutation],
      );

      const handleActivate = useCallback(
            (id: string) => {
                  activateMutation.mutate(id, {
                        onSuccess: () => void message.success('User activated'),
                        onError: () => void message.error('Failed to activate user'),
                  });
            },
            [activateMutation],
      );

      const handleForceLogout = useCallback(
            (id: string) => {
                  forceLogoutMutation.mutate(id, {
                        onSuccess: () => void message.success('User logged out'),
                        onError: () => void message.error('Failed to force logout'),
                  });
            },
            [forceLogoutMutation],
      );

      const openDrawer = useCallback((userId: string) => {
            setSelectedUserId(userId);
            setDrawerOpen(true);
      }, []);

      const closeDrawer = useCallback(() => {
            setDrawerOpen(false);
            setSelectedUserId(null);
      }, []);

      // Table columns
      const columns: ColumnsType<AdminUserListItem> = [
            {
                  title: 'User',
                  key: 'user',
                  render: (_: unknown, record: AdminUserListItem) => (
                        <div className="flex items-center gap-3">
                              <Avatar
                                    size={36}
                                    src={record.avatarUrl}
                                    icon={record.avatarUrl ? undefined : <UserOutlined />}
                              />
                              <span className="font-medium">{record.displayName}</span>
                        </div>
                  ),
            },
            {
                  title: 'Phone',
                  dataIndex: 'phoneNumber',
                  key: 'phoneNumber',
            },
            {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  render: (s: UserStatus) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
            },
            {
                  title: 'Last Seen',
                  dataIndex: 'lastSeenAt',
                  key: 'lastSeenAt',
                  render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
            },
            {
                  title: 'Joined',
                  dataIndex: 'createdAt',
                  key: 'createdAt',
                  render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
            },
            {
                  title: 'Actions',
                  key: 'actions',
                  width: 200,
                  render: (_: unknown, record: AdminUserListItem) => (
                        <Space>
                              <Button icon={<EyeOutlined />} size="small" onClick={() => openDrawer(record.id)}>
                                    View
                              </Button>
                              {record.status === 'SUSPENDED' ? (
                                    <Popconfirm
                                          title="Activate user?"
                                          onConfirm={() => handleActivate(record.id)}
                                          okText="Activate"
                                    >
                                          <Button size="small" icon={<CheckCircleOutlined />} loading={actionLoading}>
                                                Activate
                                          </Button>
                                    </Popconfirm>
                              ) : (
                                    <Popconfirm
                                          title="Suspend user?"
                                          description="All sessions will be revoked."
                                          onConfirm={() => handleSuspend(record.id)}
                                          okText="Suspend"
                                          okButtonProps={{ danger: true }}
                                    >
                                          <Button danger size="small" icon={<StopOutlined />} loading={actionLoading}>
                                                Suspend
                                          </Button>
                                    </Popconfirm>
                              )}
                        </Space>
                  ),
            },
      ];

      const handleTableChange = useCallback((pagination: TablePaginationConfig) => {
            setPage(pagination.current ?? 1);
            setPageSize(pagination.pageSize ?? DEFAULT_PAGE_SIZE);
      }, []);

      const handleDateRangeChange = useCallback((dates: [Dayjs | null, Dayjs | null] | null) => {
            if (dates?.[0] && dates?.[1]) {
                  setDateRange([dates[0], dates[1]]);
            } else {
                  setDateRange(null);
            }
            setPage(1);
      }, []);

      return (
            <div className="space-y-4">
                  <h1 className="text-2xl font-bold">Users Management</h1>

                  <Card>
                        {/* Filter Bar */}
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                              <Input
                                    placeholder="Search name or phone..."
                                    prefix={<SearchOutlined />}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    style={{ width: 240 }}
                                    allowClear
                              />
                              <Select
                                    placeholder="Status"
                                    value={status}
                                    onChange={(v) => { setStatus(v); setPage(1); }}
                                    options={STATUS_OPTIONS}
                                    style={{ width: 140 }}
                              />
                              <Select
                                    placeholder="Platform"
                                    value={platform}
                                    onChange={(v) => { setPlatform(v); setPage(1); }}
                                    options={PLATFORM_OPTIONS}
                                    style={{ width: 140 }}
                              />
                              <RangePicker
                                    value={dateRange}
                                    onChange={handleDateRangeChange}
                                    placeholder={['Joined from', 'Joined to']}
                              />
                        </div>

                        <Table
                              dataSource={data?.data ?? []}
                              columns={columns}
                              rowKey="id"
                              loading={isLoading}
                              onChange={handleTableChange}
                              pagination={{
                                    current: page,
                                    pageSize,
                                    total: data?.total ?? 0,
                                    showSizeChanger: true,
                                    showTotal: (total) => `Total ${total} users`,
                              }}
                        />
                  </Card>

                  <UserDetailDrawer
                        userId={selectedUserId}
                        open={drawerOpen}
                        onClose={closeDrawer}
                        onSuspend={handleSuspend}
                        onActivate={handleActivate}
                        onForceLogout={handleForceLogout}
                        actionLoading={actionLoading}
                  />
            </div>
      );
}
