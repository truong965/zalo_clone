/**
 * Admin Reports Page
 */

import { Table, Button, Space, Tag, Card, Input } from 'antd';
import { DeleteOutlined, SearchOutlined, CheckOutlined, EyeOutlined } from '@ant-design/icons';
import { useState } from 'react';

interface Report {
      id: string;
      reporter: string;
      reportedUser: string;
      reason: string;
      status: 'pending' | 'reviewed' | 'resolved';
      timestamp: string;
}

export function AdminReportsPage() {
      const [reports] = useState<Report[]>([
            {
                  id: '1',
                  reporter: 'John Doe',
                  reportedUser: 'Spammer User',
                  reason: 'Sending spam messages',
                  status: 'pending',
                  timestamp: '2024-02-06 10:30',
            },
            {
                  id: '2',
                  reporter: 'Jane Smith',
                  reportedUser: 'Harasser',
                  reason: 'Harassment and threats',
                  status: 'reviewed',
                  timestamp: '2024-02-06 09:45',
            },
      ]);

      const columns = [
            {
                  title: 'Reporter',
                  dataIndex: 'reporter',
                  key: 'reporter',
            },
            {
                  title: 'Reported User',
                  dataIndex: 'reportedUser',
                  key: 'reportedUser',
            },
            {
                  title: 'Reason',
                  dataIndex: 'reason',
                  key: 'reason',
            },
            {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => {
                        const colors = {
                              pending: 'orange',
                              reviewed: 'blue',
                              resolved: 'green',
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
                              <Button icon={<EyeOutlined />} size="small">View</Button>
                              <Button icon={<CheckOutlined />} size="small">Resolve</Button>
                              <Button danger icon={<DeleteOutlined />} size="small">Delete</Button>
                        </Space>
                  ),
            },
      ];

      return (
            <div className="space-y-4">
                  <h1 className="text-3xl font-bold">Reports Management</h1>

                  <Card>
                        <Input
                              placeholder="Search reports..."
                              prefix={<SearchOutlined />}
                              className="mb-4 max-w-xs"
                        />

                        <Table
                              dataSource={reports}
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
