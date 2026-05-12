/**
 * Admin Groups Page
 *
 * System-admin management for group conversations: list, create, edit metadata,
 * manage members/roles, and force close groups.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
      Avatar,
      Button,
      Card,
      Drawer,
      Form,
      Input,
      Modal,
      Popconfirm,
      Select,
      Space,
      Switch,
      Table,
      Tag,
      message,
} from 'antd';
import {
      DeleteOutlined,
      EditOutlined,
      EyeOutlined,
      PlusOutlined,
      SearchOutlined,
      StopOutlined,
      TeamOutlined,
      UserAddOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs from 'dayjs';
import {
      useAddGroupMembers,
      useAdminGroupDetail,
      useAdminGroups,
      useAdminUsers,
      useCreateGroup,
      useForceCloseGroup,
      useRemoveGroupMember,
      useUpdateGroup,
      useUpdateGroupMemberRole,
} from '@/features/admin';
import type {
      AdminGroupListItem,
      AdminGroupMember,
      AdminGroupMemberRole,
      AdminGroupStatusFilter,
      CreateAdminGroupDto,
      GroupListQuery,
      UpdateAdminGroupDto,
} from '@/features/admin';

const DEFAULT_PAGE_SIZE = 10;
const STATUS_OPTIONS = [
      { label: 'Active', value: 'ACTIVE' },
      { label: 'Closed', value: 'CLOSED' },
      { label: 'All', value: 'ALL' },
];

interface UserOption {
      label: string;
      value: string;
}

interface GroupDrawerProps {
      groupId: string | null;
      open: boolean;
      userOptions: UserOption[];
      onClose: () => void;
      onUserSearch: (value: string) => void;
}

function GroupDrawer({ groupId, open, userOptions, onClose, onUserSearch }: GroupDrawerProps) {
      const [form] = Form.useForm<UpdateAdminGroupDto>();
      const [memberForm] = Form.useForm<{ userIds: string[] }>();
      const { data: detail, isLoading } = useAdminGroupDetail(open ? groupId : null);
      const updateMutation = useUpdateGroup();
      const addMembersMutation = useAddGroupMembers();
      const removeMemberMutation = useRemoveGroupMember();
      const updateRoleMutation = useUpdateGroupMemberRole();
      const forceCloseMutation = useForceCloseGroup();

      const isClosed = !!detail?.deletedAt;
      const actionLoading =
            updateMutation.isPending ||
            addMembersMutation.isPending ||
            removeMemberMutation.isPending ||
            updateRoleMutation.isPending ||
            forceCloseMutation.isPending;

      useEffect(() => {
            if (!detail) return;
            form.setFieldsValue({
                  name: detail.name ?? '',
                  description: detail.description ?? '',
                  avatarUrl: detail.avatarUrl ?? '',
                  requireApproval: detail.requireApproval,
            });
      }, [detail, form]);

      const handleUpdate = useCallback(
            (values: UpdateAdminGroupDto) => {
                  if (!groupId) return;
                  updateMutation.mutate(
                        { id: groupId, ...values },
                        {
                              onSuccess: () => void message.success('Group updated'),
                              onError: () => void message.error('Failed to update group'),
                        },
                  );
            },
            [groupId, updateMutation],
      );

      const handleAddMembers = useCallback(
            (values: { userIds: string[] }) => {
                  if (!groupId) return;
                  addMembersMutation.mutate(
                        { id: groupId, userIds: values.userIds },
                        {
                              onSuccess: () => {
                                    memberForm.resetFields();
                                    void message.success('Members added');
                              },
                              onError: () => void message.error('Failed to add members'),
                        },
                  );
            },
            [addMembersMutation, groupId, memberForm],
      );

      const handleRoleChange = useCallback(
            (member: AdminGroupMember, role: AdminGroupMemberRole) => {
                  if (!groupId) return;
                  updateRoleMutation.mutate(
                        { id: groupId, userId: member.userId, role },
                        {
                              onSuccess: () => void message.success('Member role updated'),
                              onError: () => void message.error('Failed to update member role'),
                        },
                  );
            },
            [groupId, updateRoleMutation],
      );

      const handleRemoveMember = useCallback(
            (member: AdminGroupMember) => {
                  if (!groupId) return;
                  removeMemberMutation.mutate(
                        { id: groupId, userId: member.userId },
                        {
                              onSuccess: () => void message.success('Member removed'),
                              onError: () => void message.error('Failed to remove member'),
                        },
                  );
            },
            [groupId, removeMemberMutation],
      );

      const handleForceClose = useCallback(() => {
            if (!groupId) return;
            forceCloseMutation.mutate(groupId, {
                  onSuccess: () => void message.success('Group force closed'),
                  onError: () => void message.error('Failed to force close group'),
            });
      }, [forceCloseMutation, groupId]);

      const memberColumns: ColumnsType<AdminGroupMember> = [
            {
                  title: 'Member',
                  key: 'member',
                  render: (_: unknown, record) => (
                        <div className="flex items-center gap-3">
                              <Avatar src={record.user?.avatarUrl} icon={<TeamOutlined />} />
                              <div>
                                    <div className="font-medium">{record.user?.displayName ?? 'Unknown user'}</div>
                                    <div className="text-xs text-gray-500">{record.user?.phoneNumber ?? record.userId}</div>
                              </div>
                        </div>
                  ),
            },
            {
                  title: 'Role',
                  dataIndex: 'role',
                  key: 'role',
                  width: 140,
                  render: (_: AdminGroupMemberRole, record) =>
                        record.status === 'ACTIVE' && !isClosed ? (
                              <Select
                                    value={record.role}
                                    options={[
                                          { label: 'Admin', value: 'ADMIN' },
                                          { label: 'Member', value: 'MEMBER' },
                                    ]}
                                    onChange={(role) => handleRoleChange(record, role)}
                                    style={{ width: 120 }}
                                    disabled={actionLoading}
                              />
                        ) : (
                              <Tag>{record.role}</Tag>
                        ),
            },
            {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  width: 110,
                  render: (status: string) => (
                        <Tag color={status === 'ACTIVE' ? 'green' : 'default'}>{status}</Tag>
                  ),
            },
            {
                  title: 'Joined',
                  dataIndex: 'joinedAt',
                  key: 'joinedAt',
                  width: 130,
                  render: (value: string) => dayjs(value).format('YYYY-MM-DD'),
            },
            {
                  title: 'Actions',
                  key: 'actions',
                  width: 110,
                  render: (_: unknown, record) =>
                        record.status === 'ACTIVE' && !isClosed ? (
                              <Popconfirm
                                    title="Remove this member?"
                                    onConfirm={() => handleRemoveMember(record)}
                                    okText="Remove"
                                    okButtonProps={{ danger: true }}
                              >
                                    <Button danger size="small" icon={<DeleteOutlined />} loading={actionLoading}>
                                          Remove
                                    </Button>
                              </Popconfirm>
                        ) : null,
            },
      ];

      return (
            <Drawer
                  title={detail?.name ?? 'Group detail'}
                  open={open}
                  width={820}
                  onClose={onClose}
                  extra={
                        detail && !isClosed ? (
                              <Popconfirm
                                    title="Force close this group?"
                                    description="The group will be soft-deleted and disappear from user chat lists."
                                    onConfirm={handleForceClose}
                                    okText="Force Close"
                                    okButtonProps={{ danger: true }}
                              >
                                    <Button danger icon={<StopOutlined />} loading={actionLoading}>
                                          Force Close
                                    </Button>
                              </Popconfirm>
                        ) : null
                  }
            >
                  <div className="space-y-6">
                        <Card loading={isLoading} title="Group Metadata">
                              {detail ? (
                                    <Form form={form} layout="vertical" onFinish={handleUpdate}>
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                                                      <Input disabled={isClosed} />
                                                </Form.Item>
                                                <Form.Item name="avatarUrl" label="Avatar URL">
                                                      <Input disabled={isClosed} />
                                                </Form.Item>
                                          </div>
                                          <Form.Item name="description" label="Description">
                                                <Input.TextArea rows={3} disabled={isClosed} />
                                          </Form.Item>
                                          <Form.Item name="requireApproval" label="Require approval" valuePropName="checked">
                                                <Switch disabled={isClosed} />
                                          </Form.Item>
                                          <Space>
                                                <Button type="primary" htmlType="submit" icon={<EditOutlined />} loading={updateMutation.isPending} disabled={isClosed}>
                                                      Save changes
                                                </Button>
                                                <Tag color={isClosed ? 'red' : 'green'}>{isClosed ? 'CLOSED' : 'ACTIVE'}</Tag>
                                                <Tag>{detail.members.filter((member) => member.status === 'ACTIVE').length} active members</Tag>
                                                <Tag>{detail.messageCount} messages</Tag>
                                          </Space>
                                    </Form>
                              ) : null}
                        </Card>

                        {!isClosed ? (
                              <Card title="Add Members">
                                    <Form form={memberForm} layout="inline" onFinish={handleAddMembers}>
                                          <Form.Item name="userIds" rules={[{ required: true, message: 'Select users' }]} className="flex-1">
                                                <Select
                                                      mode="multiple"
                                                      showSearch
                                                      filterOption={false}
                                                      placeholder="Search active users..."
                                                      options={userOptions}
                                                      onSearch={onUserSearch}
                                                      style={{ minWidth: 360 }}
                                                />
                                          </Form.Item>
                                          <Button type="primary" htmlType="submit" icon={<UserAddOutlined />} loading={addMembersMutation.isPending}>
                                                Add
                                          </Button>
                                    </Form>
                              </Card>
                        ) : null}

                        <Card title="Members">
                              <Table
                                    dataSource={detail?.members ?? []}
                                    columns={memberColumns}
                                    rowKey="userId"
                                    loading={isLoading}
                                    pagination={{ pageSize: 8 }}
                              />
                        </Card>
                  </div>
            </Drawer>
      );
}

interface CreateGroupModalProps {
      open: boolean;
      userOptions: UserOption[];
      onClose: () => void;
      onUserSearch: (value: string) => void;
}

function CreateGroupModal({ open, userOptions, onClose, onUserSearch }: CreateGroupModalProps) {
      const [form] = Form.useForm<CreateAdminGroupDto>();
      const createMutation = useCreateGroup();

      const handleCreate = useCallback(
            (values: CreateAdminGroupDto) => {
                  createMutation.mutate(
                        { ...values, memberIds: values.memberIds ?? [] },
                        {
                              onSuccess: () => {
                                    form.resetFields();
                                    onClose();
                                    void message.success('Group created');
                              },
                              onError: () => void message.error('Failed to create group'),
                        },
                  );
            },
            [createMutation, form, onClose],
      );

      return (
            <Modal
                  title="Create Group"
                  open={open}
                  onCancel={onClose}
                  onOk={() => form.submit()}
                  confirmLoading={createMutation.isPending}
                  destroyOnHidden
            >
                  <Form form={form} layout="vertical" onFinish={handleCreate}>
                        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                              <Input />
                        </Form.Item>
                        <Form.Item name="description" label="Description">
                              <Input.TextArea rows={3} />
                        </Form.Item>
                        <Form.Item name="ownerId" label="Group Admin" rules={[{ required: true }]}>
                              <Select
                                    showSearch
                                    filterOption={false}
                                    placeholder="Search active users..."
                                    options={userOptions}
                                    onSearch={onUserSearch}
                              />
                        </Form.Item>
                        <Form.Item name="memberIds" label="Members" rules={[{ required: true }]}>
                              <Select
                                    mode="multiple"
                                    showSearch
                                    filterOption={false}
                                    placeholder="Search active users..."
                                    options={userOptions}
                                    onSearch={onUserSearch}
                              />
                        </Form.Item>
                        <Form.Item name="avatarUrl" label="Avatar URL">
                              <Input />
                        </Form.Item>
                        <Form.Item name="requireApproval" label="Require approval" valuePropName="checked" initialValue={false}>
                              <Switch />
                        </Form.Item>
                  </Form>
            </Modal>
      );
}

export function AdminGroupsPage() {
      const [search, setSearch] = useState('');
      const [debouncedSearch, setDebouncedSearch] = useState('');
      const [status, setStatus] = useState<AdminGroupStatusFilter>('ACTIVE');
      const [page, setPage] = useState(1);
      const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
      const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
      const [drawerOpen, setDrawerOpen] = useState(false);
      const [createOpen, setCreateOpen] = useState(false);
      const [userSearch, setUserSearch] = useState('');
      const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

      useEffect(() => {
            debounceTimer.current = setTimeout(() => {
                  setDebouncedSearch(search);
                  setPage(1);
            }, 300);
            return () => clearTimeout(debounceTimer.current);
      }, [search]);

      const queryParams: GroupListQuery = {
            page,
            limit: pageSize,
            status,
            ...(debouncedSearch ? { search: debouncedSearch } : {}),
      };
      const { data, isLoading } = useAdminGroups(queryParams);
      const { data: users } = useAdminUsers({
            page: 1,
            limit: 20,
            status: 'ACTIVE',
            ...(userSearch ? { search: userSearch } : {}),
      });

      const userOptions = useMemo(
            () =>
                  (users?.data ?? []).map((user) => ({
                        label: `${user.displayName} (${user.phoneNumber})`,
                        value: user.id,
                  })),
            [users],
      );

      const openDrawer = useCallback((groupId: string) => {
            setSelectedGroupId(groupId);
            setDrawerOpen(true);
      }, []);

      const closeDrawer = useCallback(() => {
            setDrawerOpen(false);
            setSelectedGroupId(null);
      }, []);

      const handleTableChange = useCallback((pagination: TablePaginationConfig) => {
            setPage(pagination.current ?? 1);
            setPageSize(pagination.pageSize ?? DEFAULT_PAGE_SIZE);
      }, []);

      const columns: ColumnsType<AdminGroupListItem> = [
            {
                  title: 'Group',
                  key: 'group',
                  render: (_: unknown, record) => (
                        <div className="flex items-center gap-3">
                              <Avatar src={record.avatarUrl} icon={<TeamOutlined />} />
                              <div>
                                    <div className="font-medium">{record.name ?? 'Unnamed group'}</div>
                                    <div className="text-xs text-gray-500">{record.id}</div>
                              </div>
                        </div>
                  ),
            },
            {
                  title: 'Status',
                  key: 'status',
                  width: 100,
                  render: (_: unknown, record) => (
                        <Tag color={record.deletedAt ? 'red' : 'green'}>{record.deletedAt ? 'CLOSED' : 'ACTIVE'}</Tag>
                  ),
            },
            { title: 'Members', dataIndex: 'activeMemberCount', key: 'activeMemberCount', width: 100 },
            { title: 'Admins', dataIndex: 'adminCount', key: 'adminCount', width: 90 },
            { title: 'Messages', dataIndex: 'messageCount', key: 'messageCount', width: 100 },
            {
                  title: 'Approval',
                  dataIndex: 'requireApproval',
                  key: 'requireApproval',
                  width: 110,
                  render: (value: boolean) => <Tag color={value ? 'blue' : 'default'}>{value ? 'ON' : 'OFF'}</Tag>,
            },
            {
                  title: 'Last Message',
                  dataIndex: 'lastMessageAt',
                  key: 'lastMessageAt',
                  render: (value: string | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—'),
            },
            {
                  title: 'Actions',
                  key: 'actions',
                  width: 110,
                  render: (_: unknown, record) => (
                        <Button size="small" icon={<EyeOutlined />} onClick={() => openDrawer(record.id)}>
                              Manage
                        </Button>
                  ),
            },
      ];

      return (
            <div className="space-y-4">
                  <div className="flex items-center justify-between">
                        <h1 className="text-2xl font-bold">Groups Management</h1>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                              Create Group
                        </Button>
                  </div>

                  <Card>
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                              <Input
                                    placeholder="Search group name..."
                                    prefix={<SearchOutlined />}
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    style={{ width: 260 }}
                                    allowClear
                              />
                              <Select
                                    value={status}
                                    options={STATUS_OPTIONS}
                                    onChange={(value) => {
                                          setStatus(value);
                                          setPage(1);
                                    }}
                                    style={{ width: 140 }}
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
                                    showTotal: (total) => `Total ${total} groups`,
                              }}
                        />
                  </Card>

                  <CreateGroupModal
                        open={createOpen}
                        userOptions={userOptions}
                        onClose={() => setCreateOpen(false)}
                        onUserSearch={setUserSearch}
                  />
                  <GroupDrawer
                        groupId={selectedGroupId}
                        open={drawerOpen}
                        userOptions={userOptions}
                        onClose={closeDrawer}
                        onUserSearch={setUserSearch}
                  />
            </div>
      );
}
