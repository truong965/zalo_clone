/**
 * Admin Calls Page
 */

import { Table, Button, Space, Tag, Card, Input } from 'antd';
import { DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import { useState } from 'react';

interface Call {
  id: string;
  caller: string;
  receiver: string;
  type: 'voice' | 'video';
  duration: number;
  timestamp: string;
  status: 'completed' | 'missed' | 'rejected';
}

export function AdminCallsPage() {
  const [calls] = useState<Call[]>([
    {
      id: '1',
      caller: 'John Doe',
      receiver: 'Jane Smith',
      type: 'video',
      duration: 300,
      timestamp: '2024-02-06 10:30',
      status: 'completed',
    },
    {
      id: '2',
      caller: 'Alice',
      receiver: 'Bob',
      type: 'voice',
      duration: 0,
      timestamp: '2024-02-06 09:45',
      status: 'missed',
    },
  ]);

  const columns = [
    {
      title: 'Caller',
      dataIndex: 'caller',
      key: 'caller',
    },
    {
      title: 'Receiver',
      dataIndex: 'receiver',
      key: 'receiver',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Tag color={type === 'video' ? 'blue' : 'green'}>{type}</Tag>
      ),
    },
    {
      title: 'Duration',
      dataIndex: 'duration',
      key: 'duration',
      render: (duration: number) => `${Math.floor(duration / 60)}m ${duration % 60}s`,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colors = {
          completed: 'green',
          missed: 'red',
          rejected: 'orange',
        };
        return <Tag color={colors[status as keyof typeof colors]}>{status}</Tag>;
      },
    },
    {
      title: 'Time',
      dataIndex: 'timestamp',
      key: 'timestamp',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: () => (
        <Space>
          <Button danger icon={<DeleteOutlined />} size="small">Delete</Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Calls Management</h1>

      <Card>
        <Input
          placeholder="Search calls..."
          prefix={<SearchOutlined />}
          className="mb-4 max-w-xs"
        />

        <Table
          dataSource={calls}
          columns={columns}
          rowKey="id"
          pagination={{
            pageSize: 10,
          }}
        />
      </Card>
    </div>
  );
}
