/**
 * Profile Page
 */

import { Card, Avatar, Form, Input, Button, Typography, Space, message, Descriptions } from 'antd';
import { UserOutlined, CameraOutlined } from '@ant-design/icons';
import { useState } from 'react';

const { Title, Text } = Typography;

export function ProfilePage() {
      const [editing, setEditing] = useState(false);
      const [loading, setLoading] = useState(false);
      const [form] = Form.useForm();

      const [profile] = useState({
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
            phoneNumber: '+1234567890',
            avatar: 'https://i.pravatar.cc/150?img=1',
            bio: 'Software Developer | Tech Enthusiast',
            createdAt: '2024-01-15',
      });

const onFinish = async (values: Record<string, string>) => {
    setLoading(true);
    try {
      // TODO: Call update profile API
      console.log('Update profile:', values);
      message.success('Profile updated successfully!');
      setEditing(false);
            } finally {
                  setLoading(false);
            }
      };

      return (
            <div className="p-4 max-w-2xl mx-auto">
                  <Title level={2}>My Profile</Title>

                  <Card className="mb-6">
                        <div className="flex items-center gap-6 mb-6">
                              <div className="relative">
                                    <Avatar
                                          size={120}
                                          src={profile.avatar}
                                          icon={<UserOutlined />}
                                    />
                                    <Button
                                          type="primary"
                                          shape="circle"
                                          icon={<CameraOutlined />}
                                          className="absolute bottom-0 right-0"
                                    />
                              </div>
                              <div>
                                    <Title level={3} className="mb-0">{profile.firstName} {profile.lastName}</Title>
                                    <Text type="secondary">{profile.email}</Text>
                                    <div className="mt-2">
                                          <Text italic>{profile.bio}</Text>
                                    </div>
                              </div>
                        </div>

                        {!editing ? (
                              <>
                                    <Descriptions
                                          column={1}
                                          items={[
                                                { label: 'First Name', children: profile.firstName },
                                                { label: 'Last Name', children: profile.lastName },
                                                { label: 'Email', children: profile.email },
                                                { label: 'Phone Number', children: profile.phoneNumber },
                                                { label: 'Member Since', children: profile.createdAt },
                                          ]}
                                          className="mb-4"
                                    />
                                    <Button
                                          type="primary"
                                          onClick={() => {
                                                setEditing(true);
                                                form.setFieldsValue(profile);
                                          }}
                                    >
                                          Edit Profile
                                    </Button>
                              </>
                        ) : (
                              <Form
                                    form={form}
                                    layout="vertical"
                                    onFinish={onFinish}
                              >
                                    <Form.Item
                                          name="firstName"
                                          label="First Name"
                                          rules={[{ required: true }]}
                                    >
                                          <Input />
                                    </Form.Item>

                                    <Form.Item
                                          name="lastName"
                                          label="Last Name"
                                          rules={[{ required: true }]}
                                    >
                                          <Input />
                                    </Form.Item>

                                    <Form.Item
                                          name="phoneNumber"
                                          label="Phone Number"
                                    >
                                          <Input />
                                    </Form.Item>

                                    <Form.Item
                                          name="bio"
                                          label="Bio"
                                    >
                                          <Input.TextArea rows={3} />
                                    </Form.Item>

                                    <Space>
                                          <Button
                                                type="primary"
                                                htmlType="submit"
                                                loading={loading}
                                          >
                                                Save Changes
                                          </Button>
                                          <Button onClick={() => setEditing(false)}>
                                                Cancel
                                          </Button>
                                    </Space>
                              </Form>
                        )}
                  </Card>

                  <Card title="Privacy Settings">
                        <Space direction="vertical" className="w-full">
                              <div className="flex justify-between items-center">
                                    <Text>Allow strangers to message me</Text>
                                    <Button type="text">Settings</Button>
                              </div>
                              <div className="flex justify-between items-center">
                                    <Text>Show my online status</Text>
                                    <Button type="text">Settings</Button>
                              </div>
                              <div className="flex justify-between items-center">
                                    <Text>Allow calls</Text>
                                    <Button type="text">Settings</Button>
                              </div>
                        </Space>
                  </Card>
            </div>
      );
}
