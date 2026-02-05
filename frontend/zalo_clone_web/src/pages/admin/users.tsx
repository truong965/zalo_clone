/**
 * Admin Users Page
 */

import { Table, Button, Space, Popconfirm, Tag, Input, Card } from 'antd';
import { SearchOutlined, EyeOutlined } from '@ant-design/icons';
import { useState } from 'react';

interface User {
      id: string;
      name: string;
      email: string;
      status: 'active' | 'inactive' | 'banned';
      joinDate: string;
      messagesCount: number;
}

export function AdminUsersPage() {
      const [users] = useState<User[]>([
            {
                  id: '1',
                  name: 'John Doe',
                  email: 'john@example.com',
                  status: 'active',
                  joinDate: '2024-01-15',
                  messagesCount: 342,
            },
            {
                  id: '2',
                  name: 'Jane Smith',
                  email: 'jane@example.com',
                  status: 'active',
                  joinDate: '2024-01-20',
                  messagesCount: 256,
            },
            {
                  id: '3',
                  name: 'Charlie Brown',
                  email: 'charlie@example.com',
                  status: 'inactive',
                  joinDate: '2023-12-10',
                  messagesCount: 45,
            },
      ]);

      const columns = [
            {
                  title: 'Name',
                  dataIndex: 'name',
                  key: 'name',
            },
            {
                  title: 'Email',
                  dataIndex: 'email',
                  key: 'email',
            },
            {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => {
                        const colors = {
                              active: 'green',
                              inactive: 'orange',
                              banned: 'red',
                        };
                        return <Tag color={colors[status as keyof typeof colors]}>{status}</Tag>;
                  },
            },
            {
                  title: 'Messages',
                  dataIndex: 'messagesCount',
                  key: 'messagesCount',
            },
            {
                  title: 'Join Date',
                  dataIndex: 'joinDate',
                  key: 'joinDate',
            },
            {
                  title: 'Actions',
                  key: 'actions',
                  render: (_: Record<string, any>, record: User) => (
                        <Space>
                              <Button
                                    icon={<EyeOutlined />}
                                    size="small"
                              >
                                    View
                              </Button>
                              <Popconfirm
                                    title="Ban user?"
                                    description="This will prevent the user from using the app."
                                    onConfirm={() => console.log('Ban user:', record.id)}
                                    okText="Ban"
                                    cancelText="Cancel"
                              >
                                    <Button danger size="small">Ban</Button>
                              </Popconfirm>
                        </Space>
                  ),
            },
      ];

      return (
            <div className="space-y-4">
                  <h1 className="text-3xl font-bold">Users Management</h1>

                  <Card>
                        <Input
                              placeholder="Search users..."
                              prefix={<SearchOutlined />}
                              className="mb-4 max-w-xs"
                        />

                        <Table
                              dataSource={users}
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
