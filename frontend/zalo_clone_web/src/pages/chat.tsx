/**
 * Chat Page
 */

import { Row, Col, List, Avatar, Typography, Empty, Button, Input } from 'antd';
import { PlusOutlined, SearchOutlined, SendOutlined } from '@ant-design/icons';
import { useState } from 'react';

const { Title, Text } = Typography;

interface Message {
      id: string;
      content: string;
      sender: 'me' | 'other';
      timestamp: string;
}

interface Conversation {
      id: string;
      name: string;
      avatar: string;
      lastMessage: string;
      unread: number;
      isOnline: boolean;
}

export function ChatPage() {
      const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
      const [messages] = useState<Message[]>([
            {
                  id: '1',
                  content: 'Hello! How are you?',
                  sender: 'other',
                  timestamp: '10:30 AM',
            },
            {
                  id: '2',
                  content: "I'm doing great! How about you?",
                  sender: 'me',
                  timestamp: '10:31 AM',
            },
            {
                  id: '3',
                  content: "I'm good too, thanks for asking!",
                  sender: 'other',
                  timestamp: '10:32 AM',
            },
      ]);
      const [conversations] = useState<Conversation[]>([
            {
                  id: '1',
                  name: 'John Doe',
                  avatar: 'https://i.pravatar.cc/150?img=1',
                  lastMessage: 'Hey, how are you?',
                  unread: 2,
                  isOnline: true,
            },
            {
                  id: '2',
                  name: 'Jane Smith',
                  avatar: 'https://i.pravatar.cc/150?img=2',
                  lastMessage: 'See you later!',
                  unread: 0,
                  isOnline: false,
            },
            {
                  id: '3',
                  name: 'Dev Team',
                  avatar: 'https://i.pravatar.cc/150?img=3',
                  lastMessage: 'Meeting at 3 PM',
                  unread: 5,
                  isOnline: true,
            },
      ]);

      return (
            <div className="h-full flex flex-col">
                  <Row gutter={16} className="h-full">
                        {/* Conversations List */}
                        <Col xs={24} sm={24} md={8} className="flex flex-col bg-white border-r">
                              <div className="p-4 border-b">
                                    <Title level={3} className="mb-0">Messages</Title>
                              </div>
                              <div className="p-4 border-b">
                                    <Input
                                          prefix={<SearchOutlined />}
                                          placeholder="Search conversations..."
                                          className="mb-2"
                                    />
                                    <Button
                                          type="primary"
                                          icon={<PlusOutlined />}
                                          block
                                    >
                                          New Chat
                                    </Button>
                              </div>
                              <div className="flex-1 overflow-auto">
                                    <List
                                          dataSource={conversations}
                                          renderItem={(conversation) => (
                                                <List.Item
                                                      className={`cursor-pointer hover:bg-gray-50 transition ${selectedConversation === conversation.id ? 'bg-blue-50' : ''
                                                            }`}
                                                      onClick={() => setSelectedConversation(conversation.id)}
                                                >
                                                      <List.Item.Meta
                                                            avatar={
                                                                  <Avatar src={conversation.avatar} size="large">
                                                                        {conversation.name[0]}
                                                                  </Avatar>
                                                            }
                                                            title={conversation.name}
                                                            description={conversation.lastMessage}
                                                      />
                                                </List.Item>
                                          )}
                                          split={false}
                                    />
                              </div>
                        </Col>

                        {/* Chat Messages */}
                        <Col xs={24} sm={24} md={16} className="flex flex-col bg-white">
                              {selectedConversation ? (
                                    <>
                                          <div className="p-4 border-b flex items-center justify-between">
                                                <Title level={4} className="mb-0">John Doe</Title>
                                                <span className="text-green-500">● Online</span>
                                          </div>
                                          <div className="flex-1 overflow-auto p-4 space-y-4">
                                                {messages.map((msg) => (
                                                      <div
                                                            key={msg.id}
                                                            className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}
                                                      >
                                                            <div
                                                                  className={`max-w-xs px-4 py-2 rounded-lg ${msg.sender === 'me'
                                                                              ? 'bg-blue-500 text-white'
                                                                              : 'bg-gray-200 text-gray-900'
                                                                        }`}
                                                            >
                                                                  <Text className={msg.sender === 'me' ? 'text-white' : ''}>
                                                                        {msg.content}
                                                                  </Text>
                                                                  <div className={`text-xs mt-1 ${msg.sender === 'me' ? 'text-blue-100' : 'text-gray-500'
                                                                        }`}>
                                                                        {msg.timestamp}
                                                                  </div>
                                                            </div>
                                                      </div>
                                                ))}
                                          </div>
                                          <div className="p-4 border-t flex gap-2">
                                                <Input
                                                      placeholder="Type your message..."
                                                      className="flex-1"
                                                />
                                                <Button
                                                      type="primary"
                                                      icon={<SendOutlined />}
                                                />
                                          </div>
                                    </>
                              ) : (
                                    <div className="flex-1 flex items-center justify-center">
                                          <Empty description="Select a conversation to start chatting" />
                                    </div>
                              )}
                        </Col>
                  </Row>
            </div>
      );
}
