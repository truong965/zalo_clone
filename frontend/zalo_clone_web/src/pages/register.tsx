/**
 * Register Page
 */

import { Form, Input, Button, Card, Space, Typography, Divider, message } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const { Title, Text, Link } = Typography;

export function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (values: Record<string, string>) => {
    setLoading(true);
    try {
      // TODO: Call auth API
      console.log('Register:', values);
      message.success('Registration successful! Please login.');
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <Card
        className="w-full max-w-md shadow-lg"
        bordered={false}
      >
        <Space direction="vertical" className="w-full">
          <Title level={2} className="text-center mb-2">
            💬 Zalo Clone
          </Title>
          <Text type="secondary" className="block text-center mb-6">
            Create a new account to get started.
          </Text>

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            autoComplete="off"
          >
            <Form.Item
              name="firstName"
              label="First Name"
              rules={[{ required: true, message: 'Please enter your first name!' }]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="John"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="lastName"
              label="Last Name"
              rules={[{ required: true, message: 'Please enter your last name!' }]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="Doe"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: 'Please enter your email!' },
                { type: 'email', message: 'Invalid email!' },
              ]}
            >
              <Input
                prefix={<MailOutlined />}
                placeholder="your@email.com"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="phoneNumber"
              label="Phone Number (Optional)"
            >
              <Input
                prefix={<PhoneOutlined />}
                placeholder="+1234567890"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[
                { required: true, message: 'Please enter your password!' },
                { min: 8, message: 'Password must be at least 8 characters!' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Enter a strong password"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label="Confirm Password"
              rules={[
                { required: true, message: 'Please confirm your password!' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('Passwords do not match!'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Confirm your password"
                size="large"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                size="large"
              >
                Register
              </Button>
            </Form.Item>
          </Form>

          <Divider></Divider>

          <Space direction="vertical" className="w-full">
            <Text className="text-center block">
              Already have an account?{' '}
              <Link onClick={() => navigate('/login')}>
                Login here
              </Link>
            </Text>
          </Space>
        </Space>
      </Card>
    </div>
  );
}
