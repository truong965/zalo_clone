/**
 * Calls Page
 */

import { Card, List, Avatar, Typography, Button, Space, Empty, Tabs, Badge } from 'antd';
import { PhoneOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { useState } from 'react';

const { Title, Text } = Typography;

interface Call {
      id: string;
      name: string;
      avatar: string;
      type: 'incoming' | 'outgoing' | 'missed';
      duration?: number;
      timestamp: string;
      callType: 'voice' | 'video';
}

export function CallsPage() {
      const [calls] = useState<Call[]>([
            {
                  id: '1',
                  name: 'Alice Johnson',
                  avatar: 'https://i.pravatar.cc/150?img=1',
                  type: 'incoming',
                  duration: 300,
                  timestamp: 'Today 10:30 AM',
                  callType: 'voice',
            },
            {
                  id: '2',
                  name: 'Bob Smith',
                  avatar: 'https://i.pravatar.cc/150?img=2',
                  type: 'outgoing',
                  duration: 60,
                  timestamp: 'Today 9:15 AM',
                  callType: 'video',
            },
            {
                  id: '3',
                  name: 'Charlie Brown',
                  avatar: 'https://i.pravatar.cc/150?img=3',
                  type: 'missed',
                  timestamp: 'Yesterday 3:45 PM',
                  callType: 'voice',
            },
      ]);

      const tabItems = [
            {
                  key: 'all',
                  label: 'All',
                  children: renderCallsList(calls),
            },
            {
                  key: 'recent',
                  label: 'Recent',
                  children: renderCallsList(calls.slice(0, 2)),
            },
            {
                  key: 'missed',
                  label: 'Missed',
                  children: renderCallsList(calls.filter(c => c.type === 'missed')),
            },
      ];

      function renderCallsList(callsList: Call[]) {
            return (
                  <div className="space-y-2">
                        {callsList.length > 0 ? (
                              <List
                                    dataSource={callsList}
                                    renderItem={(call) => (
                                          <Card className="mb-2 hover:shadow-md transition">
                                                <List.Item>
                                                      <List.Item.Meta
                                                            avatar={
                                                                  <Avatar src={call.avatar} size="large">
                                                                        {call.name[0]}
                                                                  </Avatar>
                                                            }
                                                            title={call.name}
                                                            description={
                                                                  <div>
                                                                        <div className="flex items-center gap-2">
                                                                              {call.callType === 'video' ? (
                                                                                    <VideoCameraOutlined className="text-blue-500" />
                                                                              ) : (
                                                                                    <PhoneOutlined className="text-green-500" />
                                                                              )}
                                                                              <Badge
                                                                                    count={call.type === 'missed' ? 'Missed' : call.type}
                                                                                    color={
                                                                                          call.type === 'missed'
                                                                                                ? 'red'
                                                                                                : call.type === 'outgoing'
                                                                                                      ? 'blue'
                                                                                                      : 'green'
                                                                                    }
                                                                              />
                                                                        </div>
                                                                        <Text type="secondary" className="text-xs">
                                                                              {call.timestamp}
                                                                              {call.duration && ` • ${Math.floor(call.duration / 60)}m ${call.duration % 60}s`}
                                                                        </Text>
                                                                  </div>
                                                            }
                                                      />
                                                      <Space>
                                                            <Button
                                                                  type="primary"
                                                                  icon={call.callType === 'video' ? <VideoCameraOutlined /> : <PhoneOutlined />}
                                                                  size="small"
                                                            >
                                                                  {call.callType === 'video' ? 'Video Call' : 'Voice Call'}
                                                            </Button>
                                                      </Space>
                                                </List.Item>
                                          </Card>
                                    )}
                              />
                        ) : (
                              <Empty description="No calls" />
                        )}
                  </div>
            );
      }

      return (
            <div className="p-4">
                  <Title level={2}>Calls</Title>
                  <Tabs items={tabItems} />
            </div>
      );
}
