/**
 * Contacts Page
 */

import { Card, List, Avatar, Button, Space, Typography, Tabs, Input, Empty, Badge } from 'antd';
import { UserAddOutlined, UserDeleteOutlined, SearchOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useState } from 'react';

const { Title } = Typography;

interface Contact {
  id: string;
  name: string;
  avatar: string;
  status: string;
  isOnline: boolean;
}

interface FriendRequest {
  id: string;
  name: string;
  avatar: string;
  status: 'pending' | 'blocked';
}

export function ContactsPage() {
  const [contacts] = useState<Contact[]>([
    {
      id: '1',
      name: 'Alice Johnson',
      avatar: 'https://i.pravatar.cc/150?img=1',
      status: 'Available',
      isOnline: true,
    },
    {
      id: '2',
      name: 'Bob Smith',
      avatar: 'https://i.pravatar.cc/150?img=2',
      status: 'In a call',
      isOnline: true,
    },
    {
      id: '3',
      name: 'Charlie Brown',
      avatar: 'https://i.pravatar.cc/150?img=3',
      status: 'Away',
      isOnline: false,
    },
  ]);

  const [requests] = useState<FriendRequest[]>([
    {
      id: '1',
      name: 'David Lee',
      avatar: 'https://i.pravatar.cc/150?img=4',
      status: 'pending',
    },
    {
      id: '2',
      name: 'Emma Wilson',
      avatar: 'https://i.pravatar.cc/150?img=5',
      status: 'pending',
    },
  ]);

  const [blockedUsers] = useState<Contact[]>([
    {
      id: '1',
      name: 'Blocked User 1',
      avatar: 'https://i.pravatar.cc/150?img=6',
      status: 'Blocked',
      isOnline: false,
    },
  ]);

  const tabItems = [
    {
      key: 'friends',
      label: `Friends (${contacts.length})`,
      children: (
        <div className="space-y-4">
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search friends..."
          />
          <List
            dataSource={contacts}
            renderItem={(contact) => (
              <Card className="mb-2 hover:shadow-md transition">
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <Badge
                        count={contact.isOnline ? <span className="bg-green-500 rounded-full w-3 h-3"></span> : null}
                      >
                        <Avatar src={contact.avatar} size="large">
                          {contact.name[0]}
                        </Avatar>
                      </Badge>
                    }
                    title={contact.name}
                    description={contact.status}
                  />
                  <Space>
                    <Button
                      type="primary"
                      icon={<UserAddOutlined />}
                      size="small"
                    >
                      Message
                    </Button>
                    <Button
                      danger
                      icon={<UserDeleteOutlined />}
                      size="small"
                    >
                      Remove
                    </Button>
                  </Space>
                </List.Item>
              </Card>
            )}
          />
        </div>
      ),
    },
    {
      key: 'requests',
      label: `Friend Requests (${requests.length})`,
      children: (
        <div className="space-y-4">
          {requests.length > 0 ? (
            requests.map((request) => (
              <Card key={request.id}>
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <Avatar src={request.avatar} size="large">
                        {request.name[0]}
                      </Avatar>
                    }
                    title={request.name}
                    description="Wants to add you as a friend"
                  />
                  <Space>
                    <Button
                      type="primary"
                      icon={<CheckOutlined />}
                      size="small"
                    >
                      Accept
                    </Button>
                    <Button
                      danger
                      icon={<CloseOutlined />}
                      size="small"
                    >
                      Decline
                    </Button>
                  </Space>
                </List.Item>
              </Card>
            ))
          ) : (
            <Empty description="No friend requests" />
          )}
        </div>
      ),
    },
    {
      key: 'blocked',
      label: `Blocked Users (${blockedUsers.length})`,
      children: (
        <div className="space-y-4">
          {blockedUsers.length > 0 ? (
            <List
              dataSource={blockedUsers}
              renderItem={(user) => (
                <Card className="mb-2">
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <Avatar src={user.avatar} size="large">
                          {user.name[0]}
                        </Avatar>
                      }
                      title={user.name}
                    />
                    <Button
                      type="default"
                      size="small"
                    >
                      Unblock
                    </Button>
                  </List.Item>
                </Card>
              )}
            />
          ) : (
            <Empty description="No blocked users" />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-4">
      <Title level={2}>Contacts & Friends</Title>
      <Tabs items={tabItems} />
    </div>
  );
}
