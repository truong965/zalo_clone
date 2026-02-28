/**
 * Admin Settings Page
 *
 * Section 1: System Status (Redis, DB, Storage, Sockets)
 * Section 2: Role Management (RBAC CRUD via existing /roles endpoints)
 * Section 3: Audit Log placeholder
 *
 * Skills applied:
 * - architecture-compound-components (SystemStatusSection, RolesSection)
 * - rendering-conditional-render (ternary)
 * - rerender-functional-setstate
 */

import { useState, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Tag,
  Button,
  Table,
  Skeleton,
  Popconfirm,
  Modal,
  Form,
  Input,
  Switch,
  message,
  Alert,
} from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  DeleteOutlined,
  DatabaseOutlined,
  WifiOutlined,
  HddOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  useSystemStatus,
  useAdminRoles,
  useCreateRole,
  useDeleteRole,
} from '@/features/admin';
import type { AdminRole, CreateRoleDto } from '@/features/admin';

// ============================================================================
// Helpers
// ============================================================================

function formatBytes(bytes: number | string): string {
  const b = Number(bytes);
  if (b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ============================================================================
// Section 1: System Status
// ============================================================================

interface StatusCardProps {
  title: string;
  icon: React.ReactNode;
  connected: boolean;
  extra?: string;
}

function StatusCard({ title, icon, connected, extra }: StatusCardProps) {
  return (
    <Card>
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <span className="font-semibold text-base">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        {connected ? (
          <Tag icon={<CheckCircleOutlined />} color="success">Connected</Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">Disconnected</Tag>
        )}
        {extra ? <span className="text-gray-500 text-sm">{extra}</span> : null}
      </div>
    </Card>
  );
}

function SystemStatusSection() {
  const { data, isLoading, refetch, isFetching } = useSystemStatus();

  return (
    <Card
      title="System Status"
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => void refetch()} loading={isFetching}>
          Refresh
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : data ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <StatusCard
              title="Redis"
              icon={<DatabaseOutlined style={{ fontSize: 20, color: '#cf1322' }} />}
              connected={data.redis.connected}
              extra={`${data.redis.latencyMs}ms`}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <StatusCard
              title="PostgreSQL"
              icon={<DatabaseOutlined style={{ fontSize: 20, color: '#1677ff' }} />}
              connected={data.database.connected}
              extra={`${data.database.latencyMs}ms`}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <StatusCard
              title="Storage (S3)"
              icon={<HddOutlined style={{ fontSize: 20, color: '#52c41a' }} />}
              connected={data.storage.connected}
              extra={`${data.storage.totalFiles} files · ${formatBytes(data.storage.usedBytes)}`}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic
                title="Active Sockets"
                value={data.activeSocketConnections}
                prefix={<WifiOutlined />}
              />
            </Card>
          </Col>
        </Row>
      ) : null}
    </Card>
  );
}

// ============================================================================
// Section 2: Role Management
// ============================================================================

function RolesSection() {
  const [rolesPage, setRolesPage] = useState(1);
  const { data: rolesData, isLoading: rolesLoading } = useAdminRoles({
    current: rolesPage,
    pageSize: 10,
  });
  const createRoleMutation = useCreateRole();
  const deleteRoleMutation = useDeleteRole();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form] = Form.useForm<CreateRoleDto>();

  const handleCreate = useCallback(async () => {
    try {
      const values = await form.validateFields();
      createRoleMutation.mutate(values, {
        onSuccess: () => {
          void message.success('Role created');
          setCreateModalOpen(false);
          form.resetFields();
        },
        onError: () => void message.error('Failed to create role'),
      });
    } catch {
      // validation error — form handles it
    }
  }, [form, createRoleMutation]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteRoleMutation.mutate(id, {
        onSuccess: () => void message.success('Role deleted'),
        onError: () => void message.error('Failed to delete role'),
      });
    },
    [deleteRoleMutation],
  );

  const columns: ColumnsType<AdminRole> = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="green">Yes</Tag> : <Tag color="default">No</Tag>),
    },
    {
      title: 'Action',
      key: 'action',
      width: 100,
      render: (_: unknown, record: AdminRole) => (
        <Popconfirm
          title="Delete this role?"
          onConfirm={() => handleDelete(record.id)}
          okText="Delete"
          okButtonProps={{ danger: true }}
        >
          <Button danger icon={<DeleteOutlined />} size="small" loading={deleteRoleMutation.isPending}>
            Delete
          </Button>
        </Popconfirm>
      ),
    },
  ];

  // The roles API may return data in different shapes, handle both:
  const roles = Array.isArray(rolesData) ? rolesData : (rolesData?.result ?? []);
  const total = Array.isArray(rolesData) ? (rolesData as AdminRole[]).length : (rolesData?.meta?.total ?? 0);

  return (
    <Card
      title="Role Management"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
          Create Role
        </Button>
      }
    >
      <Table
        dataSource={roles}
        columns={columns}
        rowKey="id"
        loading={rolesLoading}
        pagination={{
          current: rolesPage,
          pageSize: 10,
          total,
          onChange: (p) => setRolesPage(p),
        }}
      />

      <Modal
        title="Create Role"
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => setCreateModalOpen(false)}
        confirmLoading={createRoleMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: 'Role name is required' }]}
          >
            <Input placeholder="e.g. MODERATOR" />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="Active" name="isActive" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

// ============================================================================
// Main Settings Page
// ============================================================================

export function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <SystemStatusSection />

      <RolesSection />

      {/* Section 3: Audit Log placeholder */}
      <Card title="Admin Actions Log">
        <Alert
          message="Coming Soon"
          description="Requires AdminAuditLog model. This will track all admin actions (suspend, activate, force logout, role changes) with timestamps and actor info."
          type="info"
          showIcon
        />
      </Card>
    </div>
  );
}
