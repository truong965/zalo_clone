/**
 * Admin Messages Page
 */

import { Table, Button, Space, Tag, Card, Input } from 'antd';
import { DeleteOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import { useState } from 'react';

interface Message {
      id: string;
      sender: string;
      receiver: string;
      content: string;
      status: 'normal' | 'reported' | 'deleted';
      timestamp: string;
}

export function AdminMessagesPage() {
      const [messages] = useState<Message[]>([
            {
                  id: '1',
                  sender: 'John Doe',
                  receiver: 'Jane Smith',
                  content: 'Hello, how are you?',
                  status: 'normal',
                  timestamp: '2024-02-06 10:30',
            },
            {
                  id: '2',
                  sender: 'Alice',
                  receiver: 'Bob',
                  content: 'Inappropriate content...',
                  status: 'reported',
                  timestamp: '2024-02-06 09:45',
            },
      ]);

      const columns = [
            {
                  title: 'From',
                  dataIndex: 'sender',
                  key: 'sender',
            },
            {
                  title: 'To',
                  dataIndex: 'receiver',
                  key: 'receiver',
            },
            {
                  title: 'Message',
                  dataIndex: 'content',
                  key: 'content',
                  render: (text: string) => text.substring(0, 50) + '...',
            },
            {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => {
                        const colors = {
                              normal: 'green',
                              reported: 'red',
                              deleted: 'gray',
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
                  render: (_record: Message) => (
                        <Space>
                              <Button icon={<EyeOutlined />} size="small">View</Button>
                              <Button danger icon={<DeleteOutlined />} size="small">Delete</Button>
                        </Space>
                  ),
            },
      ];

      return (
            <div className="space-y-4">
                  <h1 className="text-3xl font-bold">Messages Management</h1>

                  <Card>
                        <Input
                              placeholder="Search messages..."
                              prefix={<SearchOutlined />}
                              className="mb-4 max-w-xs"
                        />

                        <Table
                              dataSource={messages}
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
